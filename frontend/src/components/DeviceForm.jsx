import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const DeviceForm = ({ deviceId, onClose, onDeviceAdded, deviceInfo }) => {
  const [deviceName, setDeviceName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Auto-generate device name based on OS
  const getDefaultDeviceName = () => {
    const userAgent = navigator.userAgent.toLowerCase();
    
    if (/iphone|ipad|ipod/.test(userAgent)) {
      return 'iPhone';
    } else if (/android/.test(userAgent)) {
      return 'Android Phone';
    } else if (/mac/.test(userAgent)) {
      return 'Mac Computer';
    } else if (/windows/.test(userAgent)) {
      return 'Windows PC';
    } else {
      return 'My Device';
    }
  };

  useEffect(() => {
    // Set default device name when component mounts
    setDeviceName(getDefaultDeviceName());
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const token = localStorage.getItem('token');

    try {
      const response = await axios.post(
        `${API_URL}/api/add-device`,
        { device_name: deviceName || getDefaultDeviceName() },
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      // Pass device status update to parent
      onDeviceAdded(response.data);
      onClose();
    } catch (err) {
      if (err.response?.data?.error === 'Device already registered') {
        setError(`This device is already registered (${err.response.data.owner})`);
      } else {
        setError(err.response?.data?.error || 'Failed to add device');
      }
      console.error('Error adding device:', err.response?.data || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>Add This Device</h2>
        
        {deviceInfo?.device_status === 'registered_to_other' ? (
          <div style={{ marginBottom: '20px', padding: '15px', background: '#fff3cd', borderRadius: '6px', border: '1px solid #ffeaa7' }}>
            <p style={{ color: '#856404', margin: 0 }}>
              ⚠️ This device is already registered ({deviceInfo.device_owner})
            </p>
          </div>
        ) : (
          <p style={{ marginBottom: '20px', color: '#666' }}>
            Would you like to add this device?
          </p>
        )}
        
        {error && <div className="error">{error}</div>}
        
        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label>Device Name</label>
            <input
              type="text"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              placeholder="Enter device name"
              disabled={deviceInfo?.device_status === 'registered_to_other'}
            />
            <small style={{ color: '#666', marginTop: '5px', display: 'block' }}>
              Suggested: {getDefaultDeviceName()}
            </small>
          </div>
          
          <div className="modal-actions">
            <button type="button" onClick={handleCancel} className="secondary">
              {deviceInfo?.device_status === 'registered_to_other' ? 'Close' : 'No, Skip'}
            </button>
            {deviceInfo?.device_status !== 'registered_to_other' && (
              <button type="submit" disabled={loading}>
                {loading ? 'Adding...' : 'Yes, Add Device'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default DeviceForm;