/**
 * LocalStorage persistence for user data.
 * All data is stored synchronously as JSON strings.
 */

// Helper: Check storage quota (~5MB max)
function warnIfStorageFull() {
  let totalBytes = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    const value = localStorage.getItem(key);
    // JS strings are UTF-16, so each char is 2 bytes
    totalBytes += (key.length + value.length) * 2;
  }
  
  // Typical limit is ~5MB (5242880 bytes). Warn if < 1MB left (i.e. > 4MB used)
  if (totalBytes > 4 * 1024 * 1024) {
    if (window.showToast) {
      window.showToast('Warning: LocalStorage is nearly full (<1MB left)', 'error');
    } else {
      console.warn('Warning: LocalStorage is nearly full (<1MB left)');
    }
  }
}

// ==========================================
// 1. Saved Searches
// ==========================================

function saveSearch(name, rightmoveUrl, zooplaUrl) {
  const key = `propquest:searches:${name}`;
  const data = { name, rightmoveUrl, zooplaUrl, savedAt: Date.now() };
  try {
    localStorage.setItem(key, JSON.stringify(data));
    warnIfStorageFull();
  } catch (e) {
    if (window.showToast) window.showToast('Failed to save search. Storage may be full.', 'error');
  }
}

function getSavedSearches() {
  const searches = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith('propquest:searches:')) {
      try {
        const item = JSON.parse(localStorage.getItem(key));
        searches.push(item);
      } catch (e) {}
    }
  }
  return searches.sort((a, b) => b.savedAt - a.savedAt); // Descending
}

function deleteSearch(name) {
  localStorage.removeItem(`propquest:searches:${name}`);
}

function renderSavedSearches() {
  const searches = getSavedSearches();
  const container = document.getElementById('saved-searches-dropdown');
  if (!container) return;
  
  container.innerHTML = '';
  
  if (searches.length === 0) {
    container.innerHTML = '<option value="">No saved searches</option>';
    return;
  }
  
  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.innerText = 'Select a saved search...';
  container.appendChild(defaultOpt);
  
  searches.forEach(search => {
    const opt = document.createElement('option');
    opt.value = search.name;
    opt.innerText = search.name;
    container.appendChild(opt);
  });
  
  // Bind onchange to populate the main inputs
  container.onchange = (e) => {
    const selectedName = e.target.value;
    const search = searches.find(s => s.name === selectedName);
    if (search) {
      const rmInput = document.getElementById('rightmove-url');
      const zInput = document.getElementById('zoopla-url');
      if (rmInput && search.rightmoveUrl) rmInput.value = search.rightmoveUrl;
      if (zInput && search.zooplaUrl) zInput.value = search.zooplaUrl;
    }
  };
}

// ==========================================
// 2. Blacklist (hidden properties)
// ==========================================

const BLACKLIST_KEY = 'propquest:blacklist';

function getBlacklist() {
  try {
    const data = localStorage.getItem(BLACKLIST_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
}

function addToBlacklist(id) {
  const list = new Set(getBlacklist());
  list.add(id);
  try {
    localStorage.setItem(BLACKLIST_KEY, JSON.stringify(Array.from(list)));
    warnIfStorageFull();
  } catch (e) {
    if (window.showToast) window.showToast('Failed to add to blacklist', 'error');
  }
}

function isBlacklisted(id) {
  const list = getBlacklist();
  return list.includes(id);
}

function clearBlacklist() {
  localStorage.removeItem(BLACKLIST_KEY);
}

// ==========================================
// 3. Highlights (favourites)
// ==========================================

const HIGHLIGHTS_KEY = 'propquest:highlights';

function _getHighlightsRaw() {
  try {
    const data = localStorage.getItem(HIGHLIGHTS_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
}

function addHighlight(id, colour) {
  const list = _getHighlightsRaw();
  // Remove if it exists to overwrite/update it
  const filtered = list.filter(item => item.id !== id);
  filtered.push({ id, colour, addedAt: Date.now() });
  
  try {
    localStorage.setItem(HIGHLIGHTS_KEY, JSON.stringify(filtered));
    warnIfStorageFull();
  } catch (e) {
    if (window.showToast) window.showToast('Failed to save highlight', 'error');
  }
}

function removeHighlight(id) {
  const list = _getHighlightsRaw();
  const filtered = list.filter(item => item.id !== id);
  localStorage.setItem(HIGHLIGHTS_KEY, JSON.stringify(filtered));
}

function getHighlights() {
  const list = _getHighlightsRaw();
  const map = new Map();
  list.forEach(item => {
    map.set(item.id, { colour: item.colour, addedAt: item.addedAt });
  });
  return map;
}

// ==========================================
// 4. User Preferences
// ==========================================

function savePreference(key, value) {
  const prefKey = `propquest:prefs:${key}`;
  try {
    localStorage.setItem(prefKey, JSON.stringify(value));
    warnIfStorageFull();
  } catch (e) {
    if (window.showToast) window.showToast('Failed to save preference', 'error');
  }
}

function getPreference(key, defaultValue) {
  const prefKey = `propquest:prefs:${key}`;
  try {
    const val = localStorage.getItem(prefKey);
    return val !== null ? JSON.parse(val) : defaultValue;
  } catch (e) {
    return defaultValue;
  }
}

// ==========================================
// 5. Export / Import
// ==========================================

function exportData() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith('propquest:')) {
      data[key] = localStorage.getItem(key);
    }
  }
  return JSON.stringify(data);
}

function importData(jsonString) {
  try {
    const data = JSON.parse(jsonString);
    if (typeof data !== 'object' || data === null) throw new Error("Invalid format");
    
    let count = 0;
    for (const key in data) {
      if (key.startsWith('propquest:')) {
        localStorage.setItem(key, data[key]);
        count++;
      }
    }
    if (window.showToast) window.showToast(`Imported ${count} records`, 'success');
    return true;
  } catch (e) {
    if (window.showToast) window.showToast('Failed to import data: ' + e.message, 'error');
    return false;
  }
}

// Export to global scope
window.warnIfStorageFull = warnIfStorageFull;
window.saveSearch = saveSearch;
window.getSavedSearches = getSavedSearches;
window.deleteSearch = deleteSearch;
window.renderSavedSearches = renderSavedSearches;
window.addToBlacklist = addToBlacklist;
window.isBlacklisted = isBlacklisted;
window.getBlacklist = getBlacklist;
window.clearBlacklist = clearBlacklist;
window.addHighlight = addHighlight;
window.removeHighlight = removeHighlight;
window.getHighlights = getHighlights;
window.savePreference = savePreference;
window.getPreference = getPreference;
window.exportData = exportData;
window.importData = importData;
