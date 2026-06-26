// client/map.js

let activeMarker = null;

function initMap() {
  // 1. Initialise the Leaflet map on the #map div
  const map = L.map('map').setView([51.505, -0.09], 11);
  window.propquestMap = map;

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  // 2. Create separate Leaflet LayerGroup instances
  // We use markerClusterGroup for property layers to improve rendering performance
  const clusterOptions = { maxClusterRadius: 40, chunkedLoading: true, chunkDelay: 50 };
  
  window.layers = {
    rightmove: L.markerClusterGroup(clusterOptions).addTo(map),
    zoopla: L.markerClusterGroup(clusterOptions).addTo(map),
    filtered: L.markerClusterGroup(clusterOptions).addTo(map),
    amenities: L.layerGroup().addTo(map)
  };

  // 7. Map click handler: close detail panel
  map.on('click', () => {
    // We'll reset the active marker highlight
    if (activeMarker) {
      activeMarker.setStyle({ 
        fillColor: activeMarker.options.originalColor, 
        weight: 1.5 
      });
      activeMarker = null;
    }

    if (typeof window.hidePropertyDetail === 'function') {
      window.hidePropertyDetail();
    } else {
      const panel = document.getElementById('detail-panel');
      if (panel) panel.classList.add('translate-x-full');
    }
  });

  // 9. On map moveend event
  map.on('moveend', () => {
    if (typeof window.onMapMove === 'function') {
      window.onMapMove();
    }
  });
}

/**
 * 4. Clears the named layer.
 */
function clearLayer(source) {
  if (window.layers && window.layers[source]) {
    window.layers[source].clearLayers();
  }
}

/**
 * 5. Clears all layers.
 */
function clearAllLayers() {
  if (window.layers) {
    Object.values(window.layers).forEach(layer => layer.clearLayers());
  }
  activeMarker = null;
}

// Utility for formatting price
function formatPrice(price) {
  if (!price) return 'POA';
  if (typeof price === 'string') return price; // Sometimes scrapers return formatted strings
  return new Intl.NumberFormat('en-GB', { 
    style: 'currency', 
    currency: 'GBP', 
    maximumFractionDigits: 0 
  }).format(price);
}

/**
 * 3. Adds markers for a given array of properties to the appropriate layer.
 */
function addMarkers(properties, source) {
  if (!window.layers || !window.layers[source]) return;
  
  clearLayer(source);

  const color = source === 'rightmove' ? '#0284C7' : 
                source === 'filtered' ? '#F59E0B' : '#7C3AED';

  const start = performance.now();
  let count = 0;
  
  const markers = [];

  properties.forEach(property => {
    if (!property.latitude || !property.longitude) return;

    // Create a Leaflet circle marker
    const marker = L.circleMarker([property.latitude, property.longitude], {
      radius: 8,
      fillColor: color,
      color: '#ffffff',
      weight: 1.5,
      opacity: 1,
      fillOpacity: 0.8,
      originalColor: color, // Custom option to store base color
      propertyId: property.id // Inject property ID for fast lookup later
    });

    const priceStr = formatPrice(property.price);
    const bedroomsStr = property.bedrooms ? `${property.bedrooms} beds` : 'Studio/Unknown';
    const typeStr = property.propertyType || 'Property';
    
    // Bind a popup
    const popupContent = `
      <div class="text-sm font-sans">
        <strong class="block text-base mb-1 text-gray-900">${priceStr}</strong>
        <div class="text-gray-700">${bedroomsStr} • ${typeStr}</div>
        <a href="#" class="view-details-link text-blue-600 hover:underline mt-2 inline-block font-medium" data-id="${property.id}">View Details</a>
      </div>
    `;
    
    marker.bindPopup(popupContent);

    // Marker click event
    marker.on('click', function() {
      // Revert previous active marker
      if (activeMarker && activeMarker !== marker) {
        activeMarker.setStyle({ 
          fillColor: activeMarker.options.originalColor, 
          weight: 1.5 
        });
      }
      
      // Highlight the clicked marker (e.g. red/orange)
      marker.setStyle({ fillColor: '#EF4444', weight: 2.5 });
      activeMarker = marker;

      // Call showPropertyDetail
      if (typeof window.showPropertyDetail === 'function') {
        window.showPropertyDetail(property);
      }
    });

    // Ensure popup "View Details" link works even if someone clicks it inside the popup
    marker.on('popupopen', function() {
      const popupNode = marker.getPopup().getElement();
      if (!popupNode) return;
      const link = popupNode.querySelector('.view-details-link');
      if (link) {
        link.onclick = (e) => {
          e.preventDefault();
          if (typeof window.showPropertyDetail === 'function') {
            window.showPropertyDetail(property);
          }
        };
      }
    });

    markers.push(marker);
    count++;
  });
  
  // Add all markers to the cluster group at once for better performance
  window.layers[source].addLayers(markers);

  const end = performance.now();
  console.log(`[Performance] addMarkers rendered ${count} markers in ${(end - start).toFixed(2)}ms`);
}

/**
 * 6. Calls map.fitBounds() on all visible markers.
 */
function fitMapToMarkers() {
  if (!window.propquestMap || !window.layers) return;
  
  const bounds = L.latLngBounds();
  let hasMarkers = false;
  
  Object.values(window.layers).forEach(layer => {
    layer.eachLayer(marker => {
      bounds.extend(marker.getLatLng());
      hasMarkers = true;
    });
  });

  if (hasMarkers) {
    window.propquestMap.fitBounds(bounds, { padding: [50, 50] });
  }
}

/**
 * 8. Returns { west, south, east, north } from map.getBounds().
 */
function getCurrentMapBounds() {
  if (!window.propquestMap) return null;
  const bounds = window.propquestMap.getBounds();
  return {
    west: bounds.getWest(),
    south: bounds.getSouth(),
    east: bounds.getEast(),
    north: bounds.getNorth()
  };
}

// Initialise when DOM is fully loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMap);
} else {
  initMap();
}

// Export functions to global scope
window.addMarkers = addMarkers;
window.clearLayer = clearLayer;
window.clearAllLayers = clearAllLayers;
window.fitMapToMarkers = fitMapToMarkers;
window.getCurrentMapBounds = getCurrentMapBounds;
