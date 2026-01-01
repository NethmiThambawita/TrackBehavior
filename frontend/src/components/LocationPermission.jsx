import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const LocationPermission = ({ deviceId, userEmail, socket, onPermissionGranted, onSkip }) => {
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [initialLocation, setInitialLocation] = useState(null);
  const watchIdRef = useRef(null);

  const requestLocationPermission = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      setStep(3);
      return;
    }

    setStep(2);
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        console.log('📌 Initial location obtained:', latitude, longitude);
        setInitialLocation({ latitude, longitude });
        grantPermission(latitude, longitude);
      },
      (error) => {
        handleGeolocationError(error);
      },
      { 
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    );
  };

  const grantPermission = (latitude, longitude) => {
    const token = localStorage.getItem('token');
    
    axios.post(
      `${API_URL}/api/grant-location-permission`,
      { 
        device_id: deviceId,
        latitude: latitude,
        longitude: longitude
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        timeout: 10000
      }
    )
    .then((response) => {
      setSuccess('Location permission granted! University initialized...');
      localStorage.setItem('location_permission', 'true');
      setStep(3);
      
      setTimeout(() => {
        if (onPermissionGranted) {
          onPermissionGranted(response.data.university);
        }
      }, 1000);
    })
    .catch((err) => {
      setError(err.response?.data?.error || 'Failed to grant location permission');
      setStep(3);
    });
  };

  const handleGeolocationError = (error) => {
    switch(error.code) {
      case error.PERMISSION_DENIED:
        setError('Location permission was denied. Please enable it in your browser settings.');
        break;
      case error.POSITION_UNAVAILABLE:
        setError('Location information is unavailable.');
        break;
      case error.TIMEOUT:
        setError('The request to get your location timed out.');
        break;
      default:
        setError('An unknown error occurred: ' + error.message);
        break;
    }
    setStep(3);
  };

  const handleSkip = () => {
    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    
    if (onSkip) {
      onSkip();
    }
  };

  useEffect(() => {
    return () => {
      if (watchIdRef.current) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: '500px' }}>
        {step === 1 && (
          <>
            <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>
              Enable Live Location Tracking
            </h2>
            
            <div style={{ textAlign: 'center', marginBottom: '30px' }}>
              <div style={{ fontSize: '48px', marginBottom: '20px' }}>🏛️</div>
              <p style={{ marginBottom: '15px', color: '#666' }}>
                Enable tracking to real-time device tracking.
              </p>
            
              <div style={{ 
                background: '#fff3cd', 
                padding: '15px', 
                borderRadius: '8px',
                marginBottom: '20px',
                textAlign: 'left',
                border: '1px solid #ffeaa7'
              }}>
                <h4 style={{ marginTop: 0, color: '#856404' }}>⚠️ Quality Filter Active:</h4>
                <ul style={{ marginBottom: 0, paddingLeft: '20px', color: '#856404' }}>
                  <li>Only GPS accuracy <strong>&lt; 50m</strong> accepted</li>
                  <li>Smart location validation enabled</li>
                  <li>Position drift protection active</li>
                </ul>
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                type="button" 
                onClick={handleSkip}
                className="secondary"
                style={{ flex: 1 }}
              >
                Skip
              </button>
              <button 
                type="button" 
                onClick={requestLocationPermission}
                style={{ flex: 1, backgroundColor: '#3498db' }}
              >
                Enable 
              </button>
            </div>
          </>
        )}
        
        {step === 2 && (
          <>
            <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>
              Initializing...
            </h2>
            
            <div style={{ textAlign: 'center', marginBottom: '30px' }}>
              <div style={{ fontSize: '48px', marginBottom: '20px', animation: 'pulse 1.5s infinite' }}>
                ⏳
              </div>
              <p style={{ marginBottom: '15px', color: '#666' }}>
                Getting your location...
              </p>
              
              <div style={{ 
                background: '#e3f2fd', 
                padding: '15px', 
                borderRadius: '8px',
                marginBottom: '20px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span>GPS Location:</span>
                  <span style={{ color: '#f39c12' }}>
                    ⏳ Acquiring...
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span>University Generation:</span>
                  <span style={{ color: '#95a5a6' }}>
                    ⏳ Waiting...
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Quality Filter:</span>
                  <span style={{ color: '#2ecc71' }}>
                    ✓ Active
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
        
        {step === 3 && (
          <>
            <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>
              {success ? 'University Created!' : 'Permission Required'}
            </h2>
            
            <div style={{ textAlign: 'center', marginBottom: '30px' }}>
              {success ? (
                <>
                  <div style={{ fontSize: '48px', marginBottom: '20px', color: '#2ecc71' }}>
                    ✅
                  </div>
                  <p style={{ marginBottom: '15px', color: '#666' }}>
                    {success}
                  </p>
                  <div style={{ 
                    background: '#d4edda', 
                    color: '#155724',
                    padding: '15px', 
                    borderRadius: '8px',
                    marginBottom: '20px'
                  }}>
                    🏛️ university created!
                  
                    <small>Watch as devices move across campus sections in real-time!</small>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: '48px', marginBottom: '20px', color: '#e74c3c' }}>
                    ❌
                  </div>
                  <p style={{ marginBottom: '15px', color: '#666' }}>
                    {error || 'Location permission is required for tracking.'}
                  </p>
                  <div style={{ 
                    background: '#f8d7da', 
                    color: '#721c24',
                    padding: '15px', 
                    borderRadius: '8px',
                    marginBottom: '20px'
                  }}>
                    Without location permission devices cannot be tracked.
                  </div>
                </>
              )}
            </div>
            
            <button 
              type="button" 
              onClick={handleSkip}
              style={{ width: '100%' }}
            >
              {success ? 'Continue' : 'Close'}
            </button>
          </>
        )}
        
        {error && <div className="error" style={{ marginTop: '15px' }}>{error}</div>}
      </div>
      
      <style jsx>{`
        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); }
        }
      `}</style>
    </div>
  );
};

export default LocationPermission;