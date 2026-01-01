import React, { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

// Define UNIVERSITY_SIZE constant for frontend (0.000324 degrees = ~36 meters)
const UNIVERSITY_SIZE = 0.000324; // 36 meters total for 3x3 grid

const MapComponent = ({ locations, currentDeviceId, university }) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef({});
  const sectionRectsRef = useRef({});
  const activeLabelRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const isUnmountingRef = useRef(false);
  const userZoomRef = useRef(null);
  const userCenterRef = useRef(null);
  const initialFitDoneRef = useRef(false);
  const [activeSection, setActiveSection] = useState(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    
    try {
      mapInstanceRef.current = L.map(mapRef.current, {
        zoomControl: true,
        scrollWheelZoom: true,
        zoomAnimation: true,
        fadeAnimation: true,
        markerZoomAnimation: true,
        maxZoom: 20,
        minZoom: 2
      }).setView([0, 0], 2);
      
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 20,
        minZoom: 2
      }).addTo(mapInstanceRef.current);
      
      L.control.scale().addTo(mapInstanceRef.current);
      
      mapInstanceRef.current.on('zoomend', () => {
        if (mapInstanceRef.current) {
          userZoomRef.current = mapInstanceRef.current.getZoom();
        }
      });

      mapInstanceRef.current.on('moveend', () => {
        if (mapInstanceRef.current) {
          userCenterRef.current = mapInstanceRef.current.getCenter();
        }
      });
      
      setMapReady(true);
      console.log('✅ Map initialized');
    } catch (error) {
      console.error('Map init error:', error);
    }
    
    return () => {
      isUnmountingRef.current = true;
      
      Object.values(markersRef.current).forEach(marker => {
        try {
          if (marker && mapInstanceRef.current) {
            marker.remove();
          }
        } catch (e) {}
      });
      markersRef.current = {};
      
      Object.values(sectionRectsRef.current).forEach(rect => {
        try {
          if (rect && mapInstanceRef.current) {
            rect.remove();
          }
        } catch (e) {}
      });
      sectionRectsRef.current = {};
      
      if (activeLabelRef.current) {
        try {
          activeLabelRef.current.remove();
          activeLabelRef.current = null;
        } catch (e) {}
      }
      
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch (e) {}
        mapInstanceRef.current = null;
      }
      
      setMapReady(false);
      setActiveSection(null);
    };
  }, []);

  // Render university sections
  useEffect(() => {
    if (!mapInstanceRef.current || !mapReady || !university || isUnmountingRef.current) return;

    try {
      console.log('🏛️ Rendering university sections (12x12m each)');

      // Remove old sections
      Object.values(sectionRectsRef.current).forEach(rect => {
        try {
          rect.remove();
        } catch (e) {}
      });
      sectionRectsRef.current = {};
      
      if (activeLabelRef.current) {
        try {
          activeLabelRef.current.remove();
          activeLabelRef.current = null;
        } catch (e) {}
      }

      // Draw new sections
      if (university.sections) {
        university.sections.forEach(section => {
          const bounds = [
            [section.bounds.min_lat, section.bounds.min_lon],
            [section.bounds.max_lat, section.bounds.max_lon]
          ];

          // Create clean section rectangle
          const rect = L.rectangle(bounds, {
            color: section.color,
            weight: 2,
            fillColor: section.color,
            fillOpacity: 0.1, // Very subtle fill
            className: `section-${section.name.replace(/\s+/g, '-')}`
          }).addTo(mapInstanceRef.current);

          // Calculate center for label
          const centerLat = (section.bounds.min_lat + section.bounds.max_lat) / 2;
          const centerLon = (section.bounds.min_lon + section.bounds.max_lon) / 2;

          // Function to show section name label
          const showSectionName = () => {
            // Remove previous active label
            if (activeLabelRef.current) {
              activeLabelRef.current.remove();
            }
            
            // Create simple label with just the name in small letters
            const label = L.marker([centerLat, centerLon], {
              icon: L.divIcon({
                html: `
                  <div style="
                    background: ${section.color};
                    color: white;
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 11px;
                    font-weight: 500;
                    white-space: nowrap;
                    border: 1px solid white;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                    animation: fadeIn 0.2s ease;
                  ">
                    ${section.name}
                  </div>
                `,
                className: 'section-label',
                iconSize: [100, 20],
                iconAnchor: [50, 10]
              }),
              interactive: false,
              zIndexOffset: 1000
            }).addTo(mapInstanceRef.current);
            
            activeLabelRef.current = label;
            setActiveSection(section.name);
            
            // Auto-hide label after 3 seconds
            setTimeout(() => {
              if (activeLabelRef.current === label) {
                label.remove();
                activeLabelRef.current = null;
                setActiveSection(null);
              }
            }, 3000);
          };

          // Add hover effect
          rect.on('mouseover', function() {
            this.setStyle({
              fillOpacity: 0.2,
              weight: 3
            });
          });
          
          rect.on('mouseout', function() {
            if (activeSection !== section.name) {
              this.setStyle({
                fillOpacity: 0.1,
                weight: 2
              });
            }
          });

          // Click to show section name
          rect.on('click', showSectionName);

          sectionRectsRef.current[section.name] = rect;
        });

        console.log('✅ University sections rendered (clean design)');
      }
    } catch (error) {
      console.error('Error rendering university:', error);
    }
  }, [university, mapReady]);

  // Highlight sections based on device locations
  useEffect(() => {
    if (!mapInstanceRef.current || !mapReady || !university || isUnmountingRef.current) return;

    try {
      // Reset all sections to default opacity
      Object.entries(sectionRectsRef.current).forEach(([sectionName, rect]) => {
        rect.setStyle({
          fillOpacity: 0.1,
          weight: 2
        });
      });

      // Highlight sections with devices
      const sectionsWithDevices = new Set();
      locations.forEach(location => {
        if (location.current_section && location.current_section !== 'Outside Campus') {
          sectionsWithDevices.add(location.current_section);
        }
      });

      sectionsWithDevices.forEach(sectionName => {
        const rect = sectionRectsRef.current[sectionName];
        if (rect) {
          rect.setStyle({
            fillOpacity: 0.25,
            weight: 3
          });
        }
      });

    } catch (error) {
      console.error('Error highlighting sections:', error);
    }
  }, [locations, university, mapReady]);

  // Update markers
  useEffect(() => {
    if (!mapInstanceRef.current || !mapReady || !locations || locations.length === 0 || isUnmountingRef.current) return;

    try {
      console.log('🔄 Updating markers for', locations.length, 'devices');

      const activeDeviceIds = new Set();

      locations.forEach((location, index) => {
        if (location.latitude && location.longitude) {
          activeDeviceIds.add(location.device_id);
          
          try {
            const isCurrentDevice = location.device_id === currentDeviceId;
            
            if (markersRef.current[location.device_id]) {
              const existingMarker = markersRef.current[location.device_id];
              const newLatLng = L.latLng(location.latitude, location.longitude);
              
              existingMarker.setLatLng(newLatLng);
              
              const popupContent = `
                <div style="padding: 10px; min-width: 200px;">
                  <strong>${location.device_name}</strong><br/>
                  <small style="color: #666;">${location.os}</small><br/>
                  <hr style="margin: 8px 0; border-color: #eee;"/>
                  <strong>Section:</strong> ${location.current_section || 'Outside Campus'}<br/>
                  <strong>Location:</strong><br/>
                  Lat: ${location.latitude.toFixed(6)}<br/>
                  Lon: ${location.longitude.toFixed(6)}<br/>
                  Accuracy: ${location.accuracy ? location.accuracy.toFixed(1) + 'm' : 'Unknown'}<br/>
                  <hr style="margin: 8px 0; border-color: #eee;"/>
                  <strong>Status:</strong> ${location.is_online ? '<span style="color: #2ecc71;">🟢 Live</span>' : '<span style="color: #e74c3c;">🔴 Offline</span>'}<br/>
                  <small style="color: #999;">Updated: ${new Date(location.timestamp).toLocaleString()}</small>
                </div>
              `;
              
              existingMarker.setPopupContent(popupContent);
              
            } else {
              const iconHtml = `
                <div style="
                  background-color: ${isCurrentDevice ? '#e74c3c' : '#3498db'};
                  width: 24px;
                  height: 24px;
                  border-radius: 50%;
                  border: 3px solid white;
                  box-shadow: 0 0 8px rgba(0,0,0,0.5);
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  color: white;
                  font-size: 12px;
                  font-weight: bold;
                ">
                  ${index + 1}
                </div>
              `;
              
              const customIcon = L.divIcon({
                html: iconHtml,
                className: 'custom-marker',
                iconSize: [30, 30],
                iconAnchor: [15, 15],
                popupAnchor: [0, -15]
              });

              const marker = L.marker([location.latitude, location.longitude], {
                icon: customIcon,
                zIndexOffset: 2000
              }).addTo(mapInstanceRef.current);

              const popupContent = `
                <div style="padding: 10px; min-width: 200px;">
                  <strong>${location.device_name}</strong><br/>
                  <small style="color: #666;">${location.os}</small><br/>
                  <hr style="margin: 8px 0; border-color: #eee;"/>
                  <strong>Section:</strong> ${location.current_section || 'Outside Campus'}<br/>
                  <strong>Location:</strong><br/>
                  Lat: ${location.latitude.toFixed(6)}<br/>
                  Lon: ${location.longitude.toFixed(6)}<br/>
                  Accuracy: ${location.accuracy ? location.accuracy.toFixed(1) + 'm' : 'Unknown'}<br/>
                  <hr style="margin: 8px 0; border-color: #eee;"/>
                  <strong>Status:</strong> ${location.is_online ? '<span style="color: #2ecc71;">🟢 Live</span>' : '<span style="color: #e74c3c;">🔴 Offline</span>'}<br/>
                  <small style="color: #999;">Updated: ${new Date(location.timestamp).toLocaleString()}</small>
                </div>
              `;

              marker.bindPopup(popupContent);
              markersRef.current[location.device_id] = marker;
            }
          } catch (error) {
            console.error('Marker error:', error);
          }
        }
      });

      Object.keys(markersRef.current).forEach(deviceId => {
        if (!activeDeviceIds.has(deviceId)) {
          try {
            markersRef.current[deviceId].remove();
            delete markersRef.current[deviceId];
          } catch (e) {}
        }
      });

      if (!initialFitDoneRef.current && locations.length > 0) {
        try {
          if (university) {
            // Fit to university bounds
            const universityBounds = L.latLngBounds([
              [university.center.lat - UNIVERSITY_SIZE/2, university.center.lon - UNIVERSITY_SIZE/2],
              [university.center.lat + UNIVERSITY_SIZE/2, university.center.lon + UNIVERSITY_SIZE/2]
            ]);
            
            const paddedBounds = universityBounds.pad(0.2);
            
            mapInstanceRef.current.fitBounds(paddedBounds, { 
              padding: [50, 50], 
              maxZoom: 18,
              animate: true,
              duration: 1
            });
            
          } else if (locations.length === 1) {
            mapInstanceRef.current.setView(
              [locations[0].latitude, locations[0].longitude], 
              16,
              { animate: true, duration: 1 }
            );
          } else {
            const bounds = L.latLngBounds(
              locations.map(loc => [loc.latitude, loc.longitude])
            );
            const paddedBounds = bounds.pad(0.1);
            mapInstanceRef.current.fitBounds(paddedBounds, { 
              padding: [50, 50], 
              maxZoom: 16,
              animate: true,
              duration: 1
            });
          }
          initialFitDoneRef.current = true;
        } catch (e) {
          console.error('Fit bounds error:', e);
        }
      }

    } catch (error) {
      console.error('Update markers error:', error);
    }

  }, [locations, currentDeviceId, mapReady, university]);

  const showAllLocations = () => {
    if (mapInstanceRef.current && university) {
      try {
        const universityBounds = L.latLngBounds([
          [university.center.lat - UNIVERSITY_SIZE/2, university.center.lon - UNIVERSITY_SIZE/2],
          [university.center.lat + UNIVERSITY_SIZE/2, university.center.lon + UNIVERSITY_SIZE/2]
        ]);
        
        const paddedBounds = universityBounds.pad(0.2);
        
        mapInstanceRef.current.fitBounds(paddedBounds, { 
          padding: [50, 50], 
          maxZoom: 18,
          animate: true,
          duration: 0.5
        });
        
        userZoomRef.current = mapInstanceRef.current.getZoom();
        userCenterRef.current = mapInstanceRef.current.getCenter();
        
      } catch (e) {
        console.error('Show all error:', e);
      }
    } else if (mapInstanceRef.current && locations && locations.length > 0) {
      try {
        const bounds = L.latLngBounds(
          locations.map(loc => [loc.latitude, loc.longitude])
        );
        const paddedBounds = bounds.pad(0.1);
        mapInstanceRef.current.fitBounds(paddedBounds, { 
          padding: [50, 50], 
          maxZoom: 16,
          animate: true,
          duration: 0.5
        });
        
        userZoomRef.current = mapInstanceRef.current.getZoom();
        userCenterRef.current = mapInstanceRef.current.getCenter();
        
      } catch (e) {
        console.error('Show all error:', e);
      }
    }
  };

  const clearActiveLabel = () => {
    if (activeLabelRef.current) {
      activeLabelRef.current.remove();
      activeLabelRef.current = null;
      setActiveSection(null);
    }
  };

  return (
    <div style={{ position: 'relative', height: '500px', borderRadius: '10px', overflow: 'hidden', border: '1px solid #ddd' }}>
      <div 
        ref={mapRef} 
        style={{ 
          width: '100%', 
          height: '100%', 
          background: '#f8f9fa'
        }}
      />
      
      {!mapReady && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(255,255,255,0.95)',
          zIndex: 1000
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '20px' }}>🗺️</div>
            <p>Loading map...</p>
          </div>
        </div>
      )}
      
      <div style={{
        position: 'absolute',
        top: '10px',
        right: '10px',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}>
        {activeSection && (
          <div style={{
            backgroundColor: '#2c3e50',
            color: 'white',
            padding: '6px 10px',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
          }}>
            <span>Section: {activeSection}</span>
            <button 
              onClick={clearActiveLabel}
              style={{
                background: 'none',
                border: 'none',
                color: 'white',
                cursor: 'pointer',
                fontSize: '12px',
                padding: '2px',
                marginLeft: '4px'
              }}
            >
              ✕
            </button>
          </div>
        )}
        
        <button 
          onClick={showAllLocations}
          style={{
            backgroundColor: '#3498db',
            color: 'white',
            border: 'none',
            padding: '8px 12px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => e.target.style.backgroundColor = '#2980b9'}
          onMouseLeave={(e) => e.target.style.backgroundColor = '#3498db'}
        >
          {university ? 'Show University' : 'Show All'}
        </button>
      </div>
      
      <div style={{
        position: 'absolute',
        bottom: '10px',
        left: '10px',
        right: '10px',
        zIndex: 1000,
        background: 'rgba(255, 255, 255, 0.95)',
        padding: '10px',
        borderRadius: '6px',
        fontSize: '11px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        border: '1px solid #eee'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#e74c3c' }}></div>
            <span>Current</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#3498db' }}></div>
            <span>Other</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#2ecc71' }}></div>
            <span>Live</span>
          </div>
          {university && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ fontSize: '10px', color: '#2c3e50' }}>
                🏛️ {university.sections?.length || 0} sections
              </span>
            </div>
          )}
          <div style={{ marginLeft: 'auto', fontSize: '10px', color: '#666' }}>
            {locations.length} device{locations.length !== 1 ? 's' : ''}
          </div>
        </div>
        {university && (
          <div style={{ 
            marginTop: '6px', 
            fontSize: '10px', 
            color: '#7f8c8d',
            padding: '4px',
            backgroundColor: '#f8f9fa',
            borderRadius: '3px',
            textAlign: 'center'
          }}>
            Click on colored areas to see section names
          </div>
        )}
      </div>
      
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        .section-label {
          animation: fadeIn 0.2s ease;
        }
      `}</style>
    </div>
  );
};

export default MapComponent;