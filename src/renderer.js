/**
 * src/renderer.js
 * The main Renderer process entry point loaded last by index.html.
 * Coordinates final startup execution and cross-module globals.
 */

// 6. Handle uncaught promise rejections silently with a toast
window.addEventListener('unhandledrejection', (event) => {
  event.preventDefault(); // Prevent Electron from crashing/logging aggressively
  const msg = event.reason?.message || event.reason || 'Unknown async error occurred';
  if (window.showToast) {
    window.showToast(`System Error: ${msg}`, 'error');
  } else {
    console.error('Unhandled Rejection:', event.reason);
  }
});

// 1. Wait for DOMContentLoaded
document.addEventListener('DOMContentLoaded', async () => {
  
  // 2a. Initialise the map (just in case map.js didn't auto-run yet)
  if (typeof window.initMap === 'function' && !window.propquestMap) {
    window.initMap();
  }

  // 2b. Call initTree() to set up the empty R-tree
  if (window.rtree && typeof window.rtree.initTree === 'function') {
    await window.rtree.initTree();
  }

  // 2c. Load previously saved searches and render them
  if (typeof window.renderSavedSearchChips === 'function') {
    window.renderSavedSearchChips();
  }

  // 2d. Check localStorage for last searched URLs and pre-fill textareas
  const rmInput = document.getElementById('rightmove-url');
  const zInput = document.getElementById('zoopla-url');
  
  if (rmInput) {
    const lastRm = localStorage.getItem('propquest:lastRightmoveUrl');
    if (lastRm) rmInput.value = lastRm;
    
    // Save to localstorage on input change so it's always remembered
    rmInput.addEventListener('change', (e) => {
      localStorage.setItem('propquest:lastRightmoveUrl', e.target.value.trim());
    });
  }
  
  if (zInput) {
    const lastZ = localStorage.getItem('propquest:lastZooplaUrl');
    if (lastZ) zInput.value = lastZ;
    
    zInput.addEventListener('change', (e) => {
      localStorage.setItem('propquest:lastZooplaUrl', e.target.value.trim());
    });
  }

  // Restore last NLP query
  const lastQuery = localStorage.getItem('propquest:lastNLPQuery');
  if (lastQuery) {
    const el = document.getElementById('nlp-query-input');
    if (el) el.value = lastQuery;
  }

  // 3. Set up debounced window.onMapMove handler
  let moveDebounceTimer;
  window.onMapMove = () => {
    clearTimeout(moveDebounceTimer);
    moveDebounceTimer = setTimeout(() => {
      // Auto-apply filters when panning if properties have been loaded
      if (typeof window.applyFilters === 'function') {
        window.applyFilters();
      }
      
      // Update amenities layer if enabled
      if (typeof window.updateAmenitiesLayer === 'function') {
        window.updateAmenitiesLayer();
      }
    }, 300);
  };

  // 4. Ensure showPropertyDetail is globally linked for map marker clicks
  if (typeof window.showPropertyDetail !== 'function' && typeof showPropertyDetail === 'function') {
    window.showPropertyDetail = showPropertyDetail;
  }

  // 5. Add a version display in the sidebar footer
  const sidebar = document.getElementById('sidebar');
  if (sidebar) {
    const footer = document.createElement('div');
    footer.className = 'mt-auto p-4 border-t border-gray-700 bg-gray-800 text-center flex flex-col items-center justify-center';
    footer.innerHTML = `
      <span class="text-[11px] font-bold text-gray-500 uppercase tracking-widest">
        PropQuest <span id="app-version" class="text-blue-500 ml-1"></span>
      </span>
    `;
    sidebar.appendChild(footer);
    
    try {
      // Require the package.json to grab the version dynamically
      const pkg = require('../package.json');
      const versionEl = document.getElementById('app-version');
      if (versionEl && pkg.version) {
        versionEl.innerText = `v${pkg.version}`;
      }
    } catch (e) {
      console.warn('Could not read package.json version:', e);
    }
  }
});
