/**
 * Main entry point that wires UI events and DOM interactions together.
 */

// Helper to format price strings
function formatPrice(price) {
  if (!price) return 'POA';
  if (typeof price === 'string') return price;
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(price);
}

// 2. Detail panel: Close button logic
function hidePropertyDetail() {
  const panel = document.getElementById('detail-panel');
  if (panel) panel.classList.add('translate-x-full');
  
  // Reset marker highlight on the map
  if (window.activeMarker) {
    window.activeMarker.setStyle({ 
      fillColor: window.activeMarker.options.originalColor, 
      weight: 1.5 
    });
    window.activeMarker = null;
  }
}
window.hidePropertyDetail = hidePropertyDetail;

// showPropertyDetail coordinates opening the panel and fetching the deep data
function showPropertyDetail(property) {
  // Populate basics immediately to feel snappy
  const titleEl = document.getElementById('property-title');
  if (titleEl) titleEl.innerText = 'Loading Address...';
  
  const priceEl = document.getElementById('property-price');
  if (priceEl) priceEl.innerText = formatPrice(property.price);
  
  const bedsEl = document.getElementById('meta-beds');
  if (bedsEl) bedsEl.innerText = property.bedrooms || '-';
  
  const typeEl = document.getElementById('meta-type');
  if (typeEl) typeEl.innerText = property.propertyType || '-';
  
  // Trigger fetch of full data
  if (window.loadPropertyDetail) {
    window.loadPropertyDetail(property.id, property.source);
  }
  
  if (typeof loadCrimeData === 'function' && property.latitude && property.longitude) {
    loadCrimeData(property.latitude, property.longitude);
  }
  
  if (typeof loadAmenities === 'function' && property.latitude && property.longitude) {
    loadAmenities(property.latitude, property.longitude);
  }
}
window.showPropertyDetail = showPropertyDetail;

// populatePropertyDetail renders the fetched JSON data into the DOM
function populatePropertyDetail(data, property, source) {
  const titleEl = document.getElementById('property-title');
  if (titleEl) {
    if (source === 'rightmove') {
      titleEl.innerText = data.property?.address?.displayAddress || property.url;
    } else {
      titleEl.innerText = data.address?.displayAddress || property.url;
    }
  }

  const contentEl = document.getElementById('property-details-content');
  const localEl = document.getElementById('property-local-content');
  
  // Extract Description and Features
  let description = '';
  let featuresHtml = '';
  
  if (source === 'rightmove') {
    description = data.property?.text?.description || '';
    const features = data.property?.features || [];
    if (features.length) {
      featuresHtml = '<ul class="list-disc pl-5 mt-4 space-y-1 text-gray-300">' + 
        features.map(f => `<li>${f}</li>`).join('') + '</ul>';
    }
  } else {
    description = data.detailedDescription || data.description || '';
    const features = data.features?.bullets || [];
    if (features.length) {
      featuresHtml = '<ul class="list-disc pl-5 mt-4 space-y-1 text-gray-300">' + 
        features.map(f => `<li>${f}</li>`).join('') + '</ul>';
    }
  }

  if (contentEl) {
    contentEl.innerHTML = `<div class="mb-4">${description}</div>${featuresHtml}`;
  }
  
  if (localEl) {
    localEl.innerHTML = '<div class="italic text-gray-500 py-4 text-center border border-dashed border-gray-700 rounded-lg">Local area information not available in scraped payload.</div>';
  }
  
  // Images Carousel
  const imagesContainer = document.getElementById('property-images');
  if (imagesContainer) {
    let images = [];
    if (source === 'rightmove') {
      images = data.property?.photoUrls || [];
    } else {
      images = data.images?.map(img => img.original || img.url) || [];
    }
    
    if (images.length > 0) {
      imagesContainer.innerHTML = `<div class="flex overflow-x-auto w-full h-full snap-x snap-mandatory hide-scrollbar">
        ${images.map(url => `<img src="${url}" loading="lazy" class="w-full h-full object-cover flex-shrink-0 snap-center" onerror="this.src=''" alt="Property Image"/>`).join('')}
      </div>`;
    } else {
      imagesContainer.innerHTML = `<div class="w-full h-full bg-gray-900 flex flex-col items-center justify-center text-gray-500"><svg class="w-10 h-10 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg><span class="text-sm">No images available</span></div>`;
    }
  }

  // Bind 'View on Website' button
  const viewBtn = document.getElementById('view-on-site-btn');
  if (viewBtn) viewBtn.href = property.url;
}
window.renderPropertyDetail = populatePropertyDetail;

// 6. Crime Data logic
async function loadCrimeData(lat, lng) {
  const localEl = document.getElementById('property-local-content');
  if (!localEl) return;
  localEl.innerHTML = '<div class="text-gray-400 text-sm text-center py-4">Loading local crime data...</div>';

  try {
    const res = await fetch('http://localhost:3000/crimes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lng })
    });
    if (!res.ok) throw new Error('Crime data fetch failed');
    const data = await res.json();
    
    if (data.total === 0) {
      localEl.innerHTML = '<div class="text-gray-400 text-sm text-center py-4">No recent crimes reported near this location.</div>';
      return;
    }
    
    // Determine overall color
    let colorClass = 'text-green-500';
    if (data.total >= 10 && data.total <= 30) colorClass = 'text-yellow-500';
    if (data.total > 30) colorClass = 'text-red-500';

    // Sort categories
    const categories = Object.keys(data.byCategory).sort((a, b) => data.byCategory[b] - data.byCategory[a]);
    const maxCount = data.byCategory[categories[0]];

    let barsHtml = categories.map(cat => {
      const count = data.byCategory[cat];
      const pct = Math.max(5, (count / maxCount) * 100);
      return \`
        <div class="flex items-center text-xs mb-1">
          <div class="w-24 truncate text-gray-400 pr-2" title="\${cat}">\${cat}</div>
          <div class="flex-1 bg-gray-800 h-2 rounded overflow-hidden flex items-center">
            <div class="bg-blue-500 h-full rounded" style="width: \${pct}%"></div>
          </div>
          <div class="w-8 text-right text-gray-300 font-bold">\${count}</div>
        </div>
      \`;
    }).join('');

    localEl.innerHTML = \`
      <div class="p-3 bg-gray-800 rounded-lg shadow-inner mb-4">
        <h4 class="text-sm font-bold text-gray-300 uppercase tracking-wide mb-1">Total Crimes (Latest Month)</h4>
        <div class="text-2xl font-black \${colorClass}">\${data.total}</div>
        <div class="text-xs text-gray-500 mt-1">Most common: <span class="text-gray-300">\${categories[0]}</span></div>
      </div>
      <div>
        <h4 class="text-sm font-bold text-gray-300 uppercase tracking-wide mb-2">Breakdown</h4>
        \${barsHtml}
      </div>
    \`;
  } catch (e) {
    localEl.innerHTML = \`<div class="text-red-400 text-sm py-4">Error loading crime data.</div>\`;
  }
}

const amenitiesCache = new Map();

async function loadAmenities(lat, lng) {
  const localEl = document.getElementById('property-local-content');
  if (!localEl) return;
  
  // Create a container for amenities if not exists
  let amenitiesContainer = document.getElementById('amenities-container');
  if (!amenitiesContainer) {
    amenitiesContainer = document.createElement('div');
    amenitiesContainer.id = 'amenities-container';
    amenitiesContainer.className = 'mt-6';
    localEl.appendChild(amenitiesContainer);
  }
  
  amenitiesContainer.innerHTML = '<div class="text-gray-400 text-sm text-center py-4">Loading local amenities...</div>';
  
  const cacheKey = `${lat},${lng}`;
  let data;
  
  if (amenitiesCache.has(cacheKey)) {
    data = amenitiesCache.get(cacheKey);
  } else {
    try {
      const res = await fetch('http://localhost:3000/amenities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng, radiusMeters: 500 })
      });
      if (!res.ok) throw new Error('Failed to fetch amenities');
      const json = await res.json();
      data = json.counts || {};
      amenitiesCache.set(cacheKey, data);
    } catch (e) {
      amenitiesContainer.innerHTML = '<div class="text-red-400 text-sm py-4">Error loading amenities data.</div>';
      return;
    }
  }

  const icons = {
    cafe: '☕',
    restaurant: '🍽️',
    gym: '💪',
    pharmacy: '💊',
    supermarket: '🛒',
    school: '🏫'
  };
  
  const labels = {
    cafe: 'Cafes',
    restaurant: 'Restaurants',
    gym: 'Gyms',
    pharmacy: 'Pharmacies',
    supermarket: 'Supermarkets',
    school: 'Schools'
  };

  const cardsHtml = Object.keys(data).map(key => {
    const count = data[key] || 0;
    return `
      <div class="bg-gray-800 rounded-lg p-3 text-center border border-gray-700/50 shadow-sm flex flex-col items-center justify-center">
        <div class="text-2xl mb-1">${icons[key] || '📍'}</div>
        <div class="text-lg font-bold text-gray-200">${count}</div>
        <div class="text-[10px] uppercase text-gray-500 font-bold tracking-wider mt-1">${labels[key] || key}</div>
      </div>
    `;
  }).join('');

  amenitiesContainer.innerHTML = `
    <h4 class="text-sm font-bold text-gray-300 uppercase tracking-wide mb-3">Amenities (500m)</h4>
    <div class="grid grid-cols-3 gap-2">
      ${cardsHtml || '<div class="col-span-3 text-gray-500 text-sm italic text-center">No amenities found nearby.</div>'}
    </div>
  `;
}

// 7. exportToCsv
function exportToCsv(properties) {
  if (!properties || !properties.length) return;
  
  const headers = ['id', 'price', 'bedrooms', 'propertyType', 'latitude', 'longitude', 'source', 'url'];
  const csvRows = [headers.join(',')];
  
  for (const p of properties) {
    const row = headers.map(header => {
      const val = p[header];
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });
    csvRows.push(row.join(','));
  }
  
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'propquest-results.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// 4. Saved Searches Render Logic
function renderSavedSearchChips() {
  let chipsContainer = document.getElementById('saved-search-chips');
  if (!chipsContainer) {
    // Inject the saved searches container dynamically below the inputs
    const searchArea = document.getElementById('search-zoopla')?.parentElement?.parentElement;
    if (!searchArea) return;
    
    const div = document.createElement('div');
    div.className = 'mt-2 pt-4 border-t border-gray-700';
    div.innerHTML = `
      <div class="flex justify-between items-center mb-3">
        <span class="text-xs font-bold text-gray-400 uppercase tracking-wider">Saved Searches</span>
        <button id="save-search-btn" class="text-[10px] bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-white font-bold uppercase transition-colors">Save Current</button>
      </div>
      <div id="saved-search-chips" class="flex flex-wrap gap-2"></div>
    `;
    searchArea.appendChild(div);
    chipsContainer = document.getElementById('saved-search-chips');
    
    // Bind Save Search button
    document.getElementById('save-search-btn').addEventListener('click', () => {
      const rmUrl = document.getElementById('rightmove-url').value.trim();
      const zUrl = document.getElementById('zoopla-url').value.trim();
      
      if (!rmUrl && !zUrl) {
        if (window.showToast) window.showToast('Enter at least one URL to save', 'error');
        return;
      }
      
      const name = prompt('Enter a short name for this search (e.g. "2 Bed Islington"):');
      if (name) {
        if (window.saveSearch) window.saveSearch(name, rmUrl, zUrl);
        renderSavedSearchChips(); // Refresh
        if (window.showToast) window.showToast('Search saved successfully', 'success');
      }
    });
  }
  
  // Clear and populate chips
  chipsContainer.innerHTML = '';
  const searches = window.getSavedSearches ? window.getSavedSearches() : [];
  
  if (searches.length === 0) {
    chipsContainer.innerHTML = '<span class="text-xs text-gray-500 italic">No saved searches</span>';
    return;
  }
  
  searches.forEach(search => {
    const chip = document.createElement('div');
    chip.className = 'bg-gray-800 hover:bg-gray-700 border border-gray-600 text-xs px-2.5 py-1 rounded-md cursor-pointer flex items-center gap-2 group transition-colors shadow-sm';
    
    const nameSpan = document.createElement('span');
    nameSpan.innerText = search.name;
    nameSpan.className = 'text-gray-300 font-medium group-hover:text-white transition-colors';
    nameSpan.onclick = () => {
      const rmInput = document.getElementById('rightmove-url');
      const zInput = document.getElementById('zoopla-url');
      if (rmInput) rmInput.value = search.rightmoveUrl || '';
      if (zInput) zInput.value = search.zooplaUrl || '';
      
      // Auto trigger search execution
      if (search.rightmoveUrl && window.searchRightmove) window.searchRightmove(search.rightmoveUrl);
      if (search.zooplaUrl && window.searchZoopla) window.searchZoopla(search.zooplaUrl);
    };
    
    const delBtn = document.createElement('button');
    delBtn.innerHTML = '&times;';
    delBtn.className = 'text-gray-500 hover:text-red-500 ml-1 text-sm leading-none opacity-50 group-hover:opacity-100 transition-opacity font-bold';
    delBtn.onclick = (e) => {
      e.stopPropagation();
      if (confirm(`Delete saved search "${search.name}"?`)) {
        if (window.deleteSearch) window.deleteSearch(search.name);
        renderSavedSearchChips();
      }
    };
    
    chip.appendChild(nameSpan);
    chip.appendChild(delBtn);
    chipsContainer.appendChild(chip);
  });
}

// 5. Property type toggle
function injectTypeToggleButtons() {
  const typeContainer = document.querySelector('.type-filter')?.closest('div')?.parentElement;
  if (typeContainer && !document.getElementById('select-all-types')) {
    const label = typeContainer.querySelector('label');
    if (label) {
      label.className = 'flex justify-between items-center w-full block text-xs text-gray-400 mb-2 font-medium';
      
      const btnGroup = document.createElement('div');
      btnGroup.className = 'flex gap-1.5';
      btnGroup.innerHTML = `
        <button id="select-all-types" class="text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded border border-gray-600 transition-colors">All</button>
        <button id="deselect-all-types" class="text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded border border-gray-600 transition-colors">None</button>
      `;
      label.appendChild(btnGroup);
      
      document.getElementById('select-all-types').addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.type-filter').forEach(cb => cb.checked = true);
      });
      
      document.getElementById('deselect-all-types').addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.type-filter').forEach(cb => cb.checked = false);
      });
    }
  }
}

// Bind tabs in the detail panel
function bindTabs() {
  const detailPanel = document.getElementById('detail-panel');
  if (!detailPanel) return;
  
  const buttons = detailPanel.querySelectorAll('.border-b-2');
  const detailsContent = document.getElementById('property-details-content');
  const localContent = document.getElementById('property-local-content');
  
  if (buttons.length >= 2) {
    buttons[0].addEventListener('click', () => {
      buttons[0].className = 'flex-1 pb-3 text-sm font-semibold border-b-2 border-blue-500 text-blue-400 transition-colors';
      buttons[1].className = 'flex-1 pb-3 text-sm font-semibold border-b-2 border-transparent text-gray-400 hover:text-gray-200 transition-colors';
      if (detailsContent) detailsContent.classList.remove('hidden');
      if (localContent) localContent.classList.add('hidden');
    });
    
    buttons[1].addEventListener('click', () => {
      buttons[1].className = 'flex-1 pb-3 text-sm font-semibold border-b-2 border-blue-500 text-blue-400 transition-colors';
      buttons[0].className = 'flex-1 pb-3 text-sm font-semibold border-b-2 border-transparent text-gray-400 hover:text-gray-200 transition-colors';
      if (detailsContent) detailsContent.classList.add('hidden');
      if (localContent) localContent.classList.remove('hidden');
    });
  }
}

// 8. Initialise on DOMContentLoaded
document.addEventListener('DOMContentLoaded', async () => {
  // Call initTree() to prepare the spatial index
  if (window.rtree && typeof window.rtree.initTree === 'function') {
    await window.rtree.initTree();
  }
  
  // 1. Search button handlers
  const rmBtn = document.getElementById('search-rightmove');
  const zBtn = document.getElementById('search-zoopla');
  const rmInput = document.getElementById('rightmove-url');
  const zInput = document.getElementById('zoopla-url');
  
  if (rmBtn && rmInput) {
    rmBtn.addEventListener('click', () => {
      if (window.searchRightmove) window.searchRightmove(rmInput.value.trim());
    });
    rmInput.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'Enter') {
        if (window.searchRightmove) window.searchRightmove(rmInput.value.trim());
      }
    });
  }
  
  if (zBtn && zInput) {
    zBtn.addEventListener('click', () => {
      if (window.searchZoopla) window.searchZoopla(zInput.value.trim());
    });
    zInput.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'Enter') {
        if (window.searchZoopla) window.searchZoopla(zInput.value.trim());
      }
    });
  }
  
  // 2. Detail panel close button
  const closeBtn = document.getElementById('close-detail');
  if (closeBtn) {
    closeBtn.addEventListener('click', hidePropertyDetail);
  }
  
  bindTabs();
  
  // 3. Map controls
  const clearBtn = document.getElementById('clear-all');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (window.clearAllLayers) window.clearAllLayers();
      if (window.rtree && window.rtree.clearTree) window.rtree.clearTree();
      
      const container = document.getElementById('results-list');
      if (container) container.innerHTML = '';
      
      if (window.updateResultsCount) window.updateResultsCount(0);
      hidePropertyDetail();
    });

    const controlsContainer = clearBtn.parentElement;
    if (controlsContainer) {
      // 1. Amenities Toggle
      const amenitiesBtn = document.createElement('button');
      amenitiesBtn.id = 'toggle-amenities';
      amenitiesBtn.className = 'px-3 py-1 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded text-xs font-bold text-gray-300 uppercase transition-colors';
      amenitiesBtn.innerText = 'Show Amenities';
      controlsContainer.insertBefore(amenitiesBtn, clearBtn);

      window.isAmenitiesHeatOn = false;
      let amenitiesAbortController = null;

      window.updateAmenitiesLayer = async () => {
        if (!window.isAmenitiesHeatOn) return;
        
        if (amenitiesAbortController) amenitiesAbortController.abort();
        amenitiesAbortController = new AbortController();
        const signal = amenitiesAbortController.signal;

        try {
          const bounds = window.getCurrentMapBounds ? window.getCurrentMapBounds() : null;
          if (!bounds) return;

          const res = await fetch('http://localhost:3000/amenities', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bounds }),
            signal
          });
          if (!res.ok) return;
          const data = await res.json();
          if (signal.aborted) return;
          
          if (window.layers && window.layers.amenities) {
            window.layers.amenities.clearLayers();
            
            const nodes = data.nodes || [];
            nodes.forEach(node => {
              if (!node.lat || !node.lng) return;
              const color = node.amenity === 'cafe' ? '#EC4899' : '#14B8A6'; // Pink cafe, teal supermarket
              const marker = L.circleMarker([node.lat, node.lng], {
                radius: 5,
                fillColor: color,
                color: '#ffffff',
                weight: 1,
                opacity: 1,
                fillOpacity: 0.9,
                pane: 'markerPane'
              });
              
              const popup = `<div class="text-xs font-bold">${node.name || 'Unknown'} <span class="text-gray-500 font-normal">(${node.amenity})</span></div>`;
              marker.bindPopup(popup);
              marker.addTo(window.layers.amenities);
            });
          }
        } catch (e) {
          if (e.name !== 'AbortError') console.error('Amenities update failed:', e);
        }
      };

      amenitiesBtn.addEventListener('click', () => {
        window.isAmenitiesHeatOn = !window.isAmenitiesHeatOn;
        if (window.isAmenitiesHeatOn) {
          amenitiesBtn.innerText = 'Hide Amenities';
          amenitiesBtn.classList.add('bg-pink-900', 'text-white', 'border-pink-700');
          window.updateAmenitiesLayer();
        } else {
          amenitiesBtn.innerText = 'Show Amenities';
          amenitiesBtn.classList.remove('bg-pink-900', 'text-white', 'border-pink-700');
          if (amenitiesAbortController) amenitiesAbortController.abort();
          if (window.layers && window.layers.amenities) {
            window.layers.amenities.clearLayers();
          }
        }
      });

      // 2. Crime Heat Toggle
      const heatBtn = document.createElement('button');
      heatBtn.id = 'toggle-crime-heat';
      heatBtn.className = 'px-3 py-1 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded text-xs font-bold text-gray-300 uppercase transition-colors';
      heatBtn.innerText = 'Show Crime Heat';
      controlsContainer.insertBefore(heatBtn, clearBtn);
      
      let isCrimeHeatOn = false;
      let abortController = null;

      heatBtn.addEventListener('click', async () => {
        isCrimeHeatOn = !isCrimeHeatOn;
        
        if (!isCrimeHeatOn) {
          heatBtn.innerText = 'Show Crime Heat';
          heatBtn.classList.remove('bg-red-900', 'text-white', 'border-red-700');
          if (abortController) abortController.abort();
          
          // Restore original colors
          if (window.layers) {
            Object.values(window.layers).forEach(layer => {
              layer.eachLayer(marker => {
                if (marker.options.originalColor) {
                  marker.setStyle({ fillColor: marker.options.originalColor });
                }
              });
            });
          }
          return;
        }

        heatBtn.innerText = 'Stop Crime Heat';
        heatBtn.classList.add('bg-red-900', 'text-white', 'border-red-700');
        
        if (abortController) abortController.abort();
        abortController = new AbortController();
        const signal = abortController.signal;

        try {
          const bounds = window.getCurrentMapBounds ? window.getCurrentMapBounds() : null;
          if (!bounds) return;
          
          const visibleProps = window.rtree.queryBoundingBox(bounds.west, bounds.south, bounds.east, bounds.north);
          if (!visibleProps.length) return;
          
          if (window.showToast) window.showToast(`Fetching crime for ${visibleProps.length} properties...`, 'info');
          
          const batchSize = 20;
          for (let i = 0; i < visibleProps.length; i += batchSize) {
            if (signal.aborted) break;
            
            const batch = visibleProps.slice(i, i + batchSize);
            await Promise.all(batch.map(async (p) => {
              if (signal.aborted) return;
              try {
                const res = await fetch('http://localhost:3000/crimes', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ lat: p.latitude, lng: p.longitude }),
                  signal
                });
                if (!res.ok) return;
                const data = await res.json();
                
                let color = '#22C55E'; // Green (< 10)
                if (data.total >= 10 && data.total <= 30) color = '#F59E0B'; // Amber
                if (data.total > 30) color = '#EF4444'; // Red

                // Find marker and update color
                if (window.layers) {
                  Object.values(window.layers).forEach(layer => {
                    layer.eachLayer(marker => {
                      if (marker.options.propertyId === p.id) {
                        marker.setStyle({ fillColor: color });
                      }
                    });
                  });
                }
              } catch (e) {
                // Ignore abort errors
              }
            }));
            
            // Sleep to avoid rate limits
            if (!signal.aborted) {
              await new Promise(r => setTimeout(r, 500));
            }
          }
          
          if (!signal.aborted && window.showToast) {
            window.showToast('Crime heat mapping complete', 'success');
            heatBtn.innerText = 'Hide Crime Heat';
          }
        } catch (e) {
          console.error(e);
        }
      });
    }
  }
  
  const exportBtn = document.getElementById('export-results');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      // Export current filtered properties present in the viewport
      const bounds = window.getCurrentMapBounds ? window.getCurrentMapBounds() : null;
      if (!bounds) return;
      
      const visible = window.rtree.queryBoundingBox(bounds.west, bounds.south, bounds.east, bounds.north);
      const filters = window.readFilters ? window.readFilters() : {};
      const filtered = window.rtree.filterProperties(visible, filters);
      
      exportToCsv(filtered);
    });
  }
  
  // 6. Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Escape: close detail panel
    if (e.key === 'Escape') {
      hidePropertyDetail();
    }
    // Ctrl+Shift+F: focus filter panel
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      const filterContent = document.getElementById('filters-content');
      if (filterContent && filterContent.classList.contains('hidden')) {
        filterContent.classList.remove('hidden');
      }
      const minPrice = document.getElementById('min-price');
      if (minPrice) minPrice.focus();
    }
  });

  // Inject dynamic UI elements
  renderSavedSearchChips();
  injectTypeToggleButtons();
  
  // Show welcome toast
  if (window.showToast) {
    window.showToast("PropQuest ready — paste a search URL to begin", "success");
  }
});
