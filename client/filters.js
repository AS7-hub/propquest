/**
 * Multi-criteria filtering of loaded property results.
 */

// 1. readFilters()
function readFilters() {
  const minPriceVal = document.getElementById('min-price')?.value;
  const maxPriceVal = document.getElementById('max-price')?.value;
  const minBedsVal = document.getElementById('min-beds')?.value;
  const maxBedsVal = document.getElementById('max-beds')?.value;
  
  const minPrice = minPriceVal ? Number(minPriceVal) : undefined;
  const maxPrice = maxPriceVal ? Number(maxPriceVal) : undefined;
  const minBeds = minBedsVal ? Number(minBedsVal) : undefined;
  const maxBeds = maxBedsVal ? Number(maxBedsVal) : undefined;
  
  const checkboxes = document.querySelectorAll('.type-filter:checked');
  const propertyTypes = Array.from(checkboxes).map(cb => cb.value);

  return {
    minPrice,
    maxPrice,
    minBeds,
    maxBeds,
    propertyTypes: propertyTypes.length > 0 ? propertyTypes : undefined
  };
}

// 2. applyFilters()
function applyFilters() {
  if (!window.rtree || !window.propquestMap) return;
  
  const filters = readFilters();
  const bounds = window.getCurrentMapBounds();
  if (!bounds) return;

  // Clear original layer groups so they don't overlap the orange filtered ones
  if (window.layers) {
    if (window.layers.rightmove) window.layers.rightmove.clearLayers();
    if (window.layers.zoopla) window.layers.zoopla.clearLayers();
  }

  // Get all visible properties in the viewport
  const visible = window.rtree.queryBoundingBox(bounds.west, bounds.south, bounds.east, bounds.north);
  
  // Apply our search criteria filters
  const filtered = window.rtree.filterProperties(visible, filters);
  
  // Restrict to max 500 sorted by price ascending for performance and UX
  const top500 = window.rtree.getTopN(filtered, 500, 'price_asc');
  
  // Clears the 'filtered' layer group and adds new markers in orange (#F59E0B)
  if (window.addMarkers) {
    window.addMarkers(top500, 'filtered');
  }
  
  // Update sidebar list and badge
  renderResultsList(top500);
  if (window.updateResultsCount) {
    // Show total filtered count, even if we only display 500 on map
    window.updateResultsCount(filtered.length);
  }
}

function formatPriceForList(price) {
  if (!price) return 'POA';
  if (typeof price === 'string') return price;
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(price);
}

// 3. renderResultsList(properties)
window.currentFilteredProperties = [];
window.currentRenderOffset = 0;
const PAGE_SIZE = 50;

function renderResultsList(properties, append = false) {
  const container = document.getElementById('results-list');
  if (!container) return;
  
  if (!append) {
    container.innerHTML = ''; // Clear existing list
    window.currentFilteredProperties = properties;
    window.currentRenderOffset = 0;
  }
  
  const total = window.currentFilteredProperties.length;
  const startIdx = window.currentRenderOffset;
  const endIdx = Math.min(startIdx + PAGE_SIZE, total);
  
  for (let i = startIdx; i < endIdx; i++) {
    const p = window.currentFilteredProperties[i];
    const card = document.createElement('div');
    card.className = 'bg-gray-900/50 p-4 rounded-lg border border-gray-700 cursor-pointer hover:bg-gray-800 hover:border-gray-500 transition-all shadow-sm group';
    
    const sourceColor = p.source === 'rightmove' ? 'bg-blue-600' : 'bg-purple-600';
    const sourceName = p.source === 'rightmove' ? 'Rightmove' : 'Zoopla';
    
    let locationStr = 'Property Listing';
    if (p.url) {
      try {
        const parts = new URL(p.url).pathname.split('/');
        locationStr = parts.length > 2 ? parts[2].replace(/-/g, ' ') : 'Property Listing';
        locationStr = locationStr.replace('.html', '').replace(/\d+/g, '').trim() || 'Property Listing';
      } catch(e) {}
    }
    
    card.innerHTML = `
      <div class="flex justify-between items-start mb-2">
        <div class="font-extrabold text-lg text-white tracking-tight">${formatPriceForList(p.price)}</div>
        <span class="${sourceColor} text-[10px] uppercase font-bold px-2 py-0.5 rounded text-white shadow-sm">${sourceName}</span>
      </div>
      <div class="text-sm text-gray-300 mb-2 truncate capitalize font-medium group-hover:text-blue-400 transition-colors">${locationStr}</div>
      <div class="flex items-center gap-2 text-xs text-gray-400 font-medium">
        <span class="flex items-center gap-1">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg> 
          ${p.bedrooms != null ? p.bedrooms + ' Beds' : 'Studio'}
        </span>
        <span>•</span>
        <span class="truncate">${p.propertyType || 'Property'}</span>
      </div>
    `;
    
    card.onclick = () => {
      // Centre map on property with fly animation
      if (window.propquestMap) {
        window.propquestMap.flyTo([p.latitude, p.longitude], 16, { duration: 0.5 });
      }
      // Open detail panel via requests.js
      if (window.loadPropertyDetail) {
        window.loadPropertyDetail(p.id, p.source);
      }
    };
    
    container.appendChild(card);
  }
  
  window.currentRenderOffset = endIdx;
  
  // Remove existing "Show more" button if any
  const existingBtn = document.getElementById('show-more-btn');
  if (existingBtn) existingBtn.remove();
  const existingMsg = document.getElementById('showing-msg');
  if (existingMsg) existingMsg.remove();
  
  // If more results exist, show button
  if (window.currentRenderOffset < total) {
    const btnContainer = document.createElement('div');
    btnContainer.id = 'show-more-btn';
    btnContainer.className = 'flex justify-center mt-4 mb-2';
    btnContainer.innerHTML = `
      <button class="bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs font-bold py-2 px-4 rounded-full border border-gray-600 transition-colors shadow-md">
        Show ${Math.min(PAGE_SIZE, total - window.currentRenderOffset)} More (of ${total})
      </button>
    `;
    btnContainer.querySelector('button').onclick = () => renderResultsList(null, true);
    container.appendChild(btnContainer);
  } else if (total > 0) {
    const msg = document.createElement('div');
    msg.id = 'showing-msg';
    msg.className = 'text-center text-xs text-gray-500 mt-5 pb-3 font-medium tracking-wide';
    msg.innerText = `Showing all ${total} results`;
    container.appendChild(msg);
  }
}

// 4. Bind filters
document.addEventListener('DOMContentLoaded', () => {
  const applyBtn = document.getElementById('apply-filters');
  if (applyBtn) {
    applyBtn.addEventListener('click', () => {
      window._filtersActive = true;
      applyFilters();
    });
  }

  let filterDebounceTimer;
  const triggerDebouncedFilter = () => {
    clearTimeout(filterDebounceTimer);
    filterDebounceTimer = setTimeout(() => {
      window._filtersActive = true;
      applyFilters();
    }, 500);
  };

  const inputs = ['min-price', 'max-price', 'min-beds', 'max-beds'];
  inputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', triggerDebouncedFilter);
  });

  const checkboxes = document.querySelectorAll('.type-filter');
  checkboxes.forEach(cb => {
    cb.addEventListener('change', triggerDebouncedFilter);
  });
});

// 5. On map moveend auto re-run applyFilters
window.onMapMove = () => {
  // We re-apply filters dynamically to capture new markers appearing inside the viewport
  applyFilters();
};

window.readFilters = readFilters;
// Expose applyFilters globally so nlp.js can trigger it
window.applyFilters = applyFilters;
window.renderResultsList = renderResultsList;
