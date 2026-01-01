import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import DeviceForm from './DeviceForm';
import LocationPermission from './LocationPermission';
import MapComponent from './MapComponent';
import io from 'socket.io-client';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const Dashboard = () => {
  const [user, setUser] = useState(null);
  const [devices, setDevices] = useState([]);
  const [showDeviceForm, setShowDeviceForm] = useState(false);
  const [showLocationPermission, setShowLocationPermission] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [locations, setLocations] = useState([]);
  const [university, setUniversity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [trackingStatus, setTrackingStatus] = useState('inactive');
  const [validationStats, setValidationStats] = useState({
    accepted: 0,
    rejected: 0,
    constrained: 0
  });
  const [mlStatus, setMlStatus] = useState({
    is_training: false,
    is_trained: false,
    training_samples: 0,
    message: ''
  });
  const [alerts, setAlerts] = useState([]);
  
  const navigate = useNavigate();
  const socketRef = useRef(null);
  const isMountedRef = useRef(true);
  const watchIdRef = useRef(null);
  const isTrackingRef = useRef(false);
  const autoTrackingAttemptedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    
    if (!token || !savedUser) {
      navigate('/login');
      return;
    }

    setUser(JSON.parse(savedUser));
    checkDeviceAndLoadDevices();
    loadUniversityLayout();
    
    initializeWebSocket();
    
    return () => {
      isMountedRef.current = false;
      
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      if (watchIdRef.current) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      isTrackingRef.current = false;
    };
  }, [navigate]);

  useEffect(() => {
    const attemptAutoTracking = async () => {
      if (autoTrackingAttemptedRef.current) return;
      if (isTrackingRef.current) return;
      if (!deviceInfo) return;
      if (loading) return;

      const locationPermission = localStorage.getItem('location_permission');
      
      if (deviceInfo.device_status === 'registered_to_me' && locationPermission === 'true') {
        console.log('🚀 Auto-starting location tracking...');
        autoTrackingAttemptedRef.current = true;
        
        setTimeout(() => {
          startRealtimeTracking();
        }, 1000);
      }
    };

    attemptAutoTracking();
  }, [deviceInfo, loading]);

  const loadUniversityLayout = async () => {
    const token = localStorage.getItem('token');
    
    try {
      const response = await axios.get(`${API_URL}/api/university-layout`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.data.university) {
        setUniversity(response.data.university);
        console.log('🏛️ University layout loaded:', response.data.university);
      }
    } catch (err) {
      console.error('Error loading university layout:', err);
    }
  };

  const loadMLStatus = async () => {
    const token = localStorage.getItem('token');
    
    try {
      const response = await axios.get(`${API_URL}/api/ml-status`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.data) {
        setMlStatus(response.data);
        console.log('🤖 ML Status:', response.data);
      }
    } catch (err) {
      console.error('Error loading ML status:', err);
    }
  };

  const initializeWebSocket = () => {
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    
    if (!token || !savedUser) return;
    
    const userData = JSON.parse(savedUser);
    
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    
    socketRef.current = io(API_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 10000,
      query: { token: token.replace('Bearer ', '') }
    });
    
    socketRef.current.on('connect', () => {
      console.log('✅ WebSocket connected');
      setConnectionStatus('connected');
      
      socketRef.current.emit('join_room', { user_email: userData.email });
    });
    
    socketRef.current.on('location_update', (data) => {
      console.log('📌 Live location received:', data);
      
      if (data.validation_reason) {
        setValidationStats(prev => {
          const newStats = { ...prev };
          if (data.validation_reason === 'high_accuracy_accepted' || data.validation_reason === 'medium_accuracy_accepted') {
            newStats.accepted++;
          } else if (data.validation_reason === 'constrained_to_radius') {
            newStats.constrained++;
          }
          return newStats;
        });
      }
      
      updateDeviceLocation(data);
      
      if (data.current_section) {
        setDevices(prevDevices => prevDevices.map(device => 
          device.device_id === data.device_id 
            ? { ...device, current_section: data.current_section }
            : device
        ));
      }
    });
    
    socketRef.current.on('location_rejected', (data) => {
      console.warn('❌ Location rejected:', data);
      
      setValidationStats(prev => ({
        ...prev,
        rejected: prev.rejected + 1
      }));
      
      setError(`Location rejected: ${data.reason} (accuracy: ${data.original_accuracy.toFixed(1)}m)`);
      setTimeout(() => setError(''), 3000);
    });
    
    socketRef.current.on('join_confirmation', (data) => {
      console.log('✅ Room joined:', data);
    });
    
    socketRef.current.on('ml_status_update', (data) => {
      console.log('🤖 ML Status Update:', data);
      setMlStatus(prev => ({ ...prev, ...data }));
      
      if (data.is_trained) {
        addAlert({
          type: 'success',
          title: 'Security System Activated',
          message: 'Machine learning model trained successfully! Anomaly detection is now active.',
          timestamp: new Date()
        });
      }
    });
    
    socketRef.current.on('ml_training_complete', (data) => {
      console.log('🎉 ML Training Complete:', data);
      setMlStatus(prev => ({ 
        ...prev, 
        is_training: false, 
        is_trained: true,
        training_samples: data.samples
      }));
      
      addAlert({
        type: 'success',
        title: 'Security System Ready',
        message: `ML model trained with ${data.samples} samples. Anomaly detection is now active!`,
        timestamp: new Date()
      });
    });
    
    socketRef.current.on('anomaly_alert', (data) => {
      console.log('🚨 ANOMALY ALERT:', data);
      
      const alert = {
        type: 'danger',
        title: '⚠️ Unusual Device Behavior Detected',
        message: `Device 1 (${data.device1_section}) and Device 2 (${data.device2_section}) are showing unusual patterns. Distance: ${data.distance.toFixed(1)}m`,
        details: data,
        timestamp: new Date(data.timestamp)
      };
      
      addAlert(alert);
      
      // Show browser notification if supported
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('🚨 Security Alert', {
          body: 'Unusual device behavior detected! Check your dashboard.',
          icon: '/favicon.ico'
        });
      }
    });
    
    socketRef.current.on('connect_error', (error) => {
      console.error('❌ WebSocket error:', error);
      setConnectionStatus('error');
    });
    
    socketRef.current.on('disconnect', (reason) => {
      console.log('⚠️ WebSocket disconnected:', reason);
      setConnectionStatus('disconnected');
    });
    
    socketRef.current.on('reconnecting', (attemptNumber) => {
      console.log('🔄 WebSocket reconnecting:', attemptNumber);
      setConnectionStatus('reconnecting');
    });
  };

  const startRealtimeTracking = useCallback(() => {
    if (!navigator.geolocation) {
      console.error('❌ Geolocation not supported');
      setTrackingStatus('error');
      return;
    }

    if (isTrackingRef.current) {
      console.log('⚠️ Tracking already active');
      return;
    }

    const deviceId = localStorage.getItem('device_id');
    const savedUser = localStorage.getItem('user');
    
    if (!deviceId || !savedUser) {
      console.error('❌ Missing device ID or user');
      setTrackingStatus('error');
      return;
    }
    
    const userData = JSON.parse(savedUser);

    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }

    isTrackingRef.current = true;
    setTrackingStatus('active');
    console.log('🚀 Starting LIVE GPS tracking...');

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        console.log(`📌 GPS: ${latitude.toFixed(6)}, ${longitude.toFixed(6)} | Accuracy: ${accuracy.toFixed(1)}m`);
        
        if (socketRef.current && socketRef.current.connected) {
          const locationData = {
            device_id: deviceId,
            latitude: latitude,
            longitude: longitude,
            accuracy: accuracy,
            user_email: userData.email,
            timestamp: new Date().toISOString()
          };
          
          console.log('📤 Sending location update');
          socketRef.current.emit('update_location', locationData);
        } else {
          console.warn('⚠️ WebSocket not connected');
        }
      },
      (error) => {
        console.error('❌ GPS error:', error.message);
        setTrackingStatus('error');
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000
      }
    );
    
    watchIdRef.current = watchId;
    localStorage.setItem('location_watch_id', watchId);
  }, []);

  const checkDeviceAndLoadDevices = async () => {
    const token = localStorage.getItem('token');
    
    try {
      setLoading(true);
      
      const deviceResponse = await axios.get(`${API_URL}/api/check-device`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        timeout: 10000
      });

      if (isMountedRef.current) {
        setDeviceInfo(deviceResponse.data);

        if (deviceResponse.data.device_status !== 'registered_to_me') {
          setShowDeviceForm(true);
        } else if (!deviceResponse.data.location_permission) {
          setShowLocationPermission(true);
        }

        await loadUserDevices();
        await loadCurrentLocations();
        await loadMLStatus();
      }
      
    } catch (err) {
      if (isMountedRef.current) {
        setError(err.response?.data?.error || 'Failed to load device information');
        console.error('Error loading device info:', err);
        
        if (err.response?.status === 401) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          navigate('/login');
        }
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const loadUserDevices = async () => {
    const token = localStorage.getItem('token');
    
    try {
      const response = await axios.get(`${API_URL}/api/user-devices`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        timeout: 10000
      });
      
      if (isMountedRef.current) {
        setDevices(response.data.devices || []);
        
        // Request notification permission when we have 2+ devices
        if (response.data.devices && response.data.devices.length >= 2) {
          if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
          }
        }
      }
    } catch (err) {
      if (isMountedRef.current) {
        console.error('Error loading devices:', err);
      }
    }
  };

  const loadCurrentLocations = async () => {
    const token = localStorage.getItem('token');
    
    try {
      console.log('📌 Loading locations from database...');
      const response = await axios.get(`${API_URL}/api/all-devices-locations`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        timeout: 10000
      });
      
      if (isMountedRef.current && response.data.locations) {
        console.log('📌 Loaded locations:', response.data.locations);
        setLocations(response.data.locations);
      }
    } catch (err) {
      console.error('Error loading locations:', err);
    }
  };

  const updateDeviceLocation = (locationData) => {
    console.log('🔄 Updating device location in state');
    
    setLocations(prevLocations => {
      const newLocations = [...prevLocations];
      const index = newLocations.findIndex(loc => loc.device_id === locationData.device_id);
      
      if (index !== -1) {
        newLocations[index] = {
          ...newLocations[index],
          latitude: locationData.latitude,
          longitude: locationData.longitude,
          accuracy: locationData.accuracy,
          timestamp: locationData.timestamp,
          is_online: true,
          validation_reason: locationData.validation_reason,
          current_section: locationData.current_section
        };
        console.log('✅ Updated existing device location');
      } else {
        const device = devices.find(d => d.device_id === locationData.device_id);
        if (device) {
          newLocations.push({
            device_id: locationData.device_id,
            device_name: device.device_name,
            os: device.os,
            latitude: locationData.latitude,
            longitude: locationData.longitude,
            accuracy: locationData.accuracy,
            timestamp: locationData.timestamp,
            is_online: true,
            validation_reason: locationData.validation_reason,
            current_section: locationData.current_section
          });
          console.log('✅ Added new device location');
        }
      }
      
      return newLocations;
    });
  };

  const addAlert = (alert) => {
    setAlerts(prev => [alert, ...prev.slice(0, 4)]); // Keep last 5 alerts
  };

  const dismissAlert = (index) => {
    setAlerts(prev => prev.filter((_, i) => i !== index));
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('device_id');
    localStorage.removeItem('location_permission');
    localStorage.removeItem('location_watch_id');
    
    const watchId = localStorage.getItem('location_watch_id');
    if (watchId) {
      navigator.geolocation.clearWatch(parseInt(watchId));
    }
    
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    
    navigate('/login');
  };

  const handleDeviceAdded = (responseData) => {
    if (responseData.device_status) {
      setDeviceInfo(responseData.device_status);
    }
    
    if (responseData.device) {
      const newDevice = {
        device_id: responseData.device.device_id,
        device_name: responseData.device.device_name,
        os: responseData.device.os,
        location_tracking: false,
        current_section: 'Outside Campus'
      };
      
      setDevices(prevDevices => [...prevDevices, newDevice]);
    }
    
    setShowDeviceForm(false);
    
    setTimeout(() => {
      if (isMountedRef.current) {
        setShowLocationPermission(true);
      }
    }, 500);
  };

  const handlePermissionGranted = (universityData) => {
    localStorage.setItem('location_permission', 'true');
    setShowLocationPermission(false);
    
    if (universityData) {
      setUniversity(universityData);
      console.log('🏛️ University initialized:', universityData);
    }
    
    setTimeout(() => {
      startRealtimeTracking();
    }, 500);
  };

  const handleSkipLocationPermission = () => {
    setShowLocationPermission(false);
  };

  const getOSIcon = (os) => {
    switch(os?.toLowerCase()) {
      case 'iphone':
        return '📱';
      case 'android':
        return '🤖';
      case 'windows':
        return '🪟';
      case 'mac':
        return '🍎';
      default:
        return '💻';
    }
  };

  const getDeviceStatusText = (status) => {
    switch(status) {
      case 'registered_to_me':
        return '✅ Registered';
      case 'registered_to_other':
        return '❌ Registered to another account';
      case 'not_registered':
        return '❌ Not registered';
      default:
        return '❓ Unknown';
    }
  };

  const getConnectionStatusIcon = () => {
    switch(connectionStatus) {
      case 'connected':
        return '🟢';
      case 'reconnecting':
        return '🟡';
      case 'error':
        return '🔴';
      default:
        return '⚪';
    }
  };

  const getTrackingStatusBadge = () => {
    switch(trackingStatus) {
      case 'active':
        return <span style={{ color: '#2ecc71', fontWeight: 'bold' }}>🟢 Tracking Active</span>;
      case 'error':
        return <span style={{ color: '#e74c3c', fontWeight: 'bold' }}>🔴 Tracking Error</span>;
      default:
        return <span style={{ color: '#95a5a6', fontWeight: 'bold' }}>⚪ Tracking Inactive</span>;
    }
  };

  const getMLStatusBadge = () => {
    if (mlStatus.is_trained) {
      return <span style={{ color: '#2ecc71', fontWeight: 'bold' }}>🟢 Security Active</span>;
    } else if (mlStatus.is_training) {
      return <span style={{ color: '#f39c12', fontWeight: 'bold' }}>🟡 Training ({mlStatus.training_samples}/50)</span>;
    } else if (devices.length >= 2) {
      return <span style={{ color: '#3498db', fontWeight: 'bold' }}>🔵 Ready to Train</span>;
    } else {
      return <span style={{ color: '#95a5a6', fontWeight: 'bold' }}>⚪ Needs 2+ Devices</span>;
    }
  };

  const getSectionBadge = (section) => {
    if (!section || section === 'Outside Campus') {
      return <span style={{ color: '#95a5a6', fontSize: '12px' }}>📌 Outside Campus</span>;
    }
    
    const sectionColors = {
      'Main Building': '#e74c3c',
      'Library': '#3498db',
      'New Building': '#2ecc71',
      'Canteen': '#f39c12',
      'Sports Complex': '#9b59b6',
      'Admin Block': '#1abc9c'
    };
    
    return (
      <span style={{ 
        color: sectionColors[section] || '#333',
        fontSize: '12px',
        fontWeight: 'bold'
      }}>
        📌 {section}
      </span>
    );
  };

  const getAlertColor = (type) => {
    switch(type) {
      case 'success':
        return '#d4edda';
      case 'danger':
        return '#f8d7da';
      case 'warning':
        return '#fff3cd';
      default:
        return '#e2e3e5';
    }
  };

  const getAlertTextColor = (type) => {
    switch(type) {
      case 'success':
        return '#155724';
      case 'danger':
        return '#721c24';
      case 'warning':
        return '#856404';
      default:
        return '#383d41';
    }
  };

  if (loading) {
    return (
      <div className="loading">
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '20px' }}>🔄</div>
          <h2>Loading Dashboard...</h2>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="header">
        <div>
          <h1>Device Tracker Dashboard</h1>
          <p style={{ color: '#666' }}>Welcome, {user?.email}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', flexWrap: 'wrap' }}>
            <span>Connection: {getConnectionStatusIcon()} {connectionStatus}</span>
            <span>{getTrackingStatusBadge()}</span>
            <span>{getMLStatusBadge()}</span>
            <span style={{ color: '#666' }}>
              Tracking {locations.length} device{locations.length !== 1 ? 's' : ''}
            </span>
            {university && <span style={{ color: '#2ecc71' }}>🏛️ University Active</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button 
            onClick={loadCurrentLocations}
            style={{ width: 'auto', padding: '10px 15px', backgroundColor: '#3498db' }}
          >
            Refresh
          </button>
          <button onClick={handleLogout} style={{ width: 'auto', padding: '10px 20px' }}>
            Logout
          </button>
        </div>
      </div>

      {error && (
        <div className="error" style={{ marginBottom: '20px' }}>
          {error}
          <button 
            onClick={() => setError('')}
            style={{ marginLeft: '10px', padding: '5px 10px', fontSize: '12px' }}
          >
            Dismiss
          </button>
        </div>
      )}

      {alerts.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          {alerts.map((alert, index) => (
            <div 
              key={index}
              style={{
                background: getAlertColor(alert.type),
                color: getAlertTextColor(alert.type),
                padding: '15px',
                borderRadius: '6px',
                marginBottom: '10px',
                borderLeft: `4px solid ${getAlertTextColor(alert.type)}`,
                position: 'relative'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>{alert.title}</strong>
                  <p style={{ margin: '5px 0 0 0', fontSize: '14px' }}>{alert.message}</p>
                  {alert.details && (
                    <small style={{ fontSize: '12px', opacity: 0.8 }}>
                      {new Date(alert.timestamp).toLocaleTimeString()} • Confidence: {alert.details.confidence?.toFixed(2)}
                    </small>
                  )}
                </div>
                <button 
                  onClick={() => dismissAlert(index)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: getAlertTextColor(alert.type),
                    fontSize: '18px',
                    cursor: 'pointer',
                    padding: '0 5px'
                  }}
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
        <div style={{ background: 'white', borderRadius: '10px', padding: '20px' }}>
          <h2>Current Device</h2>
          <p><strong>Device ID:</strong> {deviceInfo?.device_id?.substring(0, 20)}...</p>
          <p><strong>OS:</strong> {deviceInfo?.os || 'Detecting...'} {getOSIcon(deviceInfo?.os)}</p>
          <p><strong>Status:</strong> {getDeviceStatusText(deviceInfo?.device_status)}</p>
          <p><strong>Permission:</strong> {deviceInfo?.location_permission ? '✅ Enabled' : '❌ Disabled'}</p>
          <p><strong>Tracking:</strong> {getTrackingStatusBadge()}</p>
        </div>

        <div style={{ background: 'white', borderRadius: '10px', padding: '20px' }}>
          <h2>Security System</h2>
          <p><strong>ML Status:</strong> {getMLStatusBadge()}</p>
          <p><strong>Devices:</strong> {devices.length}/2+ required</p>
          <p><strong>Training Samples:</strong> {mlStatus.training_samples}/50</p>
          <p><strong>Anomaly Detection:</strong> {mlStatus.is_trained ? '✅ Active' : '⏳ Pending'}</p>
          {mlStatus.message && (
            <p style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
              {mlStatus.message}
            </p>
          )}
        </div>
      </div>

      <div style={{ background: 'white', borderRadius: '10px', padding: '20px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h2 style={{ margin: 0 }}>Live Location Map {university && '🏛️'}</h2>
        </div>
        
        {locations.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
            <div style={{ fontSize: '48px', marginBottom: '20px' }}>📌</div>
            <p>No location data available yet.</p>
            {trackingStatus === 'active' ? (
              <p>Tracking is active. Waiting for GPS data...</p>
            ) : (
              <p>Enable location permission to start tracking.</p>
            )}
          </div>
        ) : (
          <>
            <MapComponent 
              locations={locations}
              currentDeviceId={deviceInfo?.device_id}
              university={university}
            />
            
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', 
              gap: '10px',
              marginTop: '20px'
            }}>
              <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '8px' }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#3498db' }}>
                  {locations.length}
                </div>
                <div style={{ fontSize: '14px', color: '#666' }}>Devices Tracked</div>
              </div>
              
              <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '8px' }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#2ecc71' }}>
                  {locations.filter(loc => loc.is_online).length}
                </div>
                <div style={{ fontSize: '14px', color: '#666' }}>Online Now</div>
              </div>
              
              <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '8px' }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#2ecc71' }}>
                  {validationStats.accepted}
                </div>
                <div style={{ fontSize: '14px', color: '#666' }}>✅ Accepted</div>
              </div>
              
              <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '8px' }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#f39c12' }}>
                  {validationStats.constrained}
                </div>
                <div style={{ fontSize: '14px', color: '#666' }}>🔒 Constrained</div>
              </div>
              
              <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '8px' }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#e74c3c' }}>
                  {validationStats.rejected}
                </div>
                <div style={{ fontSize: '14px', color: '#666' }}>❌ Rejected</div>
              </div>
            </div>
          </>
        )}
      </div>

      <div style={{ background: 'white', borderRadius: '10px', padding: '20px' }}>
        <h2>Your Devices ({devices.length})</h2>
        
        {devices.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
            <p>No devices registered yet.</p>
            <p style={{ fontSize: '14px', marginTop: '10px' }}>
              Add 2+ devices to activate machine learning security system
            </p>
          </div>
        ) : (
          <div className="device-list">
            {devices.map((device, index) => {
              const currentLocation = locations.find(loc => loc.device_id === device.device_id);
              
              return (
                <div key={index} className="device-card">
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
                    <span style={{ fontSize: '24px', marginRight: '10px' }}>
                      {getOSIcon(device.os)}
                    </span>
                    <div style={{ flex: 1 }}>
                      <h3 style={{ margin: 0 }}>{device.device_name}</h3>
                      <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>
                        {device.os} • ID: {device.device_id.substring(0, 10)}...
                      </p>
                      <div style={{ marginTop: '5px' }}>
                        {getSectionBadge(currentLocation?.current_section || device.current_section)}
                      </div>
                    </div>
                    <div style={{ 
                      padding: '5px 10px', 
                      borderRadius: '4px', 
                      fontSize: '12px',
                      backgroundColor: device.location_tracking ? '#2ecc71' : '#e74c3c',
                      color: 'white'
                    }}>
                      {device.location_tracking ? '📌 Active' : '📌 Inactive'}
                    </div>
                  </div>
                  
                  {currentLocation && (
                    <div style={{ 
                      marginTop: '10px', 
                      padding: '10px', 
                      background: '#f8f9fa',
                      borderRadius: '4px',
                      fontSize: '12px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <strong>Live Location:</strong>
                      </div>
                      <div>Lat: {currentLocation.latitude?.toFixed(6)}</div>
                      <div>Lon: {currentLocation.longitude?.toFixed(6)}</div>
                      <div>Accuracy: {currentLocation.accuracy?.toFixed(1)}m</div>
                      <div>Updated: {new Date(currentLocation.timestamp).toLocaleTimeString()}</div>
                      <div style={{ color: currentLocation.is_online ? '#2ecc71' : '#e74c3c' }}>
                        {currentLocation.is_online ? '🟢 Live' : '🔴 Offline'}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showDeviceForm && deviceInfo && (
        <DeviceForm
          deviceId={deviceInfo.device_id}
          deviceInfo={deviceInfo}
          onClose={() => setShowDeviceForm(false)}
          onDeviceAdded={handleDeviceAdded}
        />
      )}

      {showLocationPermission && deviceInfo && user && (
        <LocationPermission
          deviceId={deviceInfo.device_id}
          userEmail={user.email}
          socket={socketRef.current}
          onPermissionGranted={handlePermissionGranted}
          onSkip={handleSkipLocationPermission}
        />
      )}
    </div>
  );
};

export default Dashboard;