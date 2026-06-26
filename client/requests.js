// client/requests.js

const API_BASE = 'http://localhost:3000';

/**
 * Shows a toast notification.
 */
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  // Fixed bottom-right, rounded, shadow
  toast.className = 'fixed bottom-5 right-5 p-4 rounded-lg shadow-2xl text-white font-medium z-[9999] transition-opacity duration-300';
  
  if (type === 'error') {
    toast.classList.add('bg-red-600');
  } else if (type === 'success') {
    toast.classList.add('bg-green-600');
  } else {
    toast.classList.add('bg-blue-600');
  }
  
  toast.innerText = message;
  document.body.appendChild(toast);
  
  // Auto-remove after 3s
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/**
 * Toggles #loading-overlay visibility and disables search buttons.
 */
function showLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.classList.remove('hidden');
  
  const rmBtn = document.getElementById('search-rightmove');
  const zBtn = document.getElementById('search-zoopla');
  if (rmBtn) rmBtn.disabled = true;
  if (zBtn) zBtn.disabled = true;
}

/**
 * Toggles #loading-overlay visibility and enables search buttons.
 */
function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.classList.add('hidden');
  
  const rmBtn = document.getElementById('search-rightmove');
  const zBtn = document.getElementById('search-zoopla');
  if (rmBtn) rmBtn.disabled = false;
  if (zBtn) zBtn.disabled = false;
}

/**
 * Sets #results-count text.
 */
function updateResultsCount(count) {
  const badge = document.getElementById('results-count');
  if (badge) badge.innerText = `${count} properties found`;
}

/**
 * Search Rightmove API
 */
async function searchRightmove(url) {
  if (!url) return showToast('Please enter a Rightmove URL', 'error');
  
  showLoading();
  try {
    const response = await fetch(`${API_BASE}/rightmoveMap`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: url
    });
    
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    if (window.rtree) window.rtree.insertProperties(data);
    if (window.addMarkers) window.addMarkers(data, 'rightmove');
    if (window.fitMapToMarkers) window.fitMapToMarkers();
    
    updateResultsCount(data.length);
    showToast(`Loaded ${data.length} properties from Rightmove`, 'success');
  } catch (error) {
    console.error(error);
    showToast(`Error: ${error.message}`, 'error');
  } finally {
    hideLoading();
  }
}

/**
 * Search Zoopla API
 */
async function searchZoopla(url) {
  if (!url) return showToast('Please enter a Zoopla URL', 'error');
  
  showLoading();
  try {
    const response = await fetch(`${API_BASE}/zooplaMap`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: url
    });
    
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    if (window.rtree) window.rtree.insertProperties(data);
    if (window.addMarkers) window.addMarkers(data, 'zoopla');
    if (window.fitMapToMarkers) window.fitMapToMarkers();
    
    updateResultsCount(data.length);
    showToast(`Loaded ${data.length} properties from Zoopla`, 'success');
  } catch (error) {
    console.error(error);
    showToast(`Error: ${error.message}`, 'error');
  } finally {
    hideLoading();
  }
}

/**
 * Fetch and display detailed property info in the sliding panel.
 */
async function loadPropertyDetail(id, source) {
  const property = window.rtree ? window.rtree.getPropertyById(id) : null;
  if (!property || !property.url) {
    return showToast('Property URL not found', 'error');
  }
  
  // 1. Opens the detail panel (slides it in from the right)
  const detailPanel = document.getElementById('detail-panel');
  if (detailPanel) detailPanel.classList.remove('translate-x-full');
  
  const contentEl = document.getElementById('property-details-content');
  const titleEl = document.getElementById('property-title');
  const priceEl = document.getElementById('property-price');
  
  // 2. Shows loading state in the detail panel
  if (titleEl) titleEl.innerText = 'Loading...';
  if (priceEl) priceEl.innerText = '£...';
  if (contentEl) contentEl.innerHTML = `
    <div class="animate-pulse space-y-4">
      <div class="h-4 bg-gray-700 rounded w-3/4"></div>
      <div class="h-4 bg-gray-700 rounded w-1/2"></div>
      <div class="h-4 bg-gray-700 rounded w-5/6"></div>
    </div>
  `;
  
  try {
    const endpoint = source === 'rightmove' ? 'rightmoveProperty' : 'zooplaProperty';
    const response = await fetch(`${API_BASE}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: property.url
    });
    
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    // 3. Populates the detail panel with the returned data
    // Defer complex DOM assembly to the UI module if available
    if (typeof window.renderPropertyDetail === 'function') {
      window.renderPropertyDetail(data, property, source);
    } else {
      // Basic fallback
      if (titleEl) titleEl.innerText = 'Property Data Loaded';
      if (contentEl) contentEl.innerHTML = `<pre class="text-xs overflow-auto text-gray-400 p-3 bg-gray-900 rounded-lg shadow-inner">${JSON.stringify(data, null, 2)}</pre>`;
      const viewBtn = document.getElementById('view-on-site-btn');
      if (viewBtn) viewBtn.href = property.url;
    }
    
  } catch (error) {
    console.error(error);
    showToast(`Error loading details: ${error.message}`, 'error');
    if (contentEl) contentEl.innerHTML = `<div class="text-red-400 py-4 bg-red-900/20 p-3 rounded">Failed to load property details.</div>`;
    if (titleEl) titleEl.innerText = 'Error';
  }
}

// Global exports
window.searchRightmove = searchRightmove;
window.searchZoopla = searchZoopla;
window.loadPropertyDetail = loadPropertyDetail;
window.showToast = showToast;
window.showLoading = showLoading;
window.hideLoading = hideLoading;
window.updateResultsCount = updateResultsCount;
