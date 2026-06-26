/**
 * Spatial indexing layer using rbush.
 * Manages an in-memory R-tree index of loaded properties.
 */

let tree = null;
let propertyById = new Map();
let RBushClass = null;

/**
 * Initializes the RBush tree and property Map.
 * Supports both CommonJS and ES Modules depending on the rbush version.
 * @returns {Promise<void>}
 */
async function initTree() {
  if (!RBushClass) {
    try {
      // rbush v3 (CommonJS) fallback
      const rbushModule = require('rbush');
      RBushClass = rbushModule.default || rbushModule;
    } catch(err) {
      // rbush v4 is pure ESM
      const rbushModule = await import('rbush');
      RBushClass = rbushModule.default || rbushModule;
    }
  }
  tree = new RBushClass();
  propertyById.clear();
}

/**
 * Inserts an array of properties into the R-Tree using bulk load.
 * @param {Array<Object>} propertiesArray - Array of normalized property objects.
 * @returns {number} The number of items inserted.
 */
function insertProperties(propertiesArray) {
  if (!tree) throw new Error("Tree not initialized. Call initTree first.");
  
  const mapped = propertiesArray
    .filter(p => p.latitude != null && p.longitude != null)
    .map(p => {
      const item = {
        ...p,
        minX: p.longitude,
        minY: p.latitude,
        maxX: p.longitude,
        maxY: p.latitude
      };
      propertyById.set(p.id, item);
      return item;
    });

  // Bulk-loads for performance
  tree.load(mapped);
  return mapped.length;
}

/**
 * Queries properties within a bounding box.
 * @param {number} west - Min longitude
 * @param {number} south - Min latitude
 * @param {number} east - Max longitude
 * @param {number} north - Max latitude
 * @returns {Array<Object>} Array of matching properties
 */
function queryBoundingBox(west, south, east, north) {
  if (!tree) throw new Error("Tree not initialized.");
  return tree.search({ minX: west, minY: south, maxX: east, maxY: north });
}

/**
 * Calculates Haversine distance between two coordinates in km.
 * @private
 */
function getHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * Queries properties within a radius of a point.
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} radiusKm - Radius in kilometers
 * @returns {Array<Object>} Properties sorted by distance ascending, with `distanceKm` added
 */
function queryRadius(lat, lng, radiusKm) {
  // Approximate conversion: 1 deg lat ≈ 111.32 km, 1 deg lng ≈ 111.32 * cos(lat) km
  const latDelta = radiusKm / 111.32;
  const lngDelta = radiusKm / (111.32 * Math.cos(lat * Math.PI / 180));
  
  const minX = lng - lngDelta;
  const maxX = lng + lngDelta;
  const minY = lat - latDelta;
  const maxY = lat + latDelta;

  // Pre-filter with bounding box
  const bboxResults = queryBoundingBox(minX, minY, maxX, maxY);
  const results = [];

  // Exact haversine filter
  for (const item of bboxResults) {
    const dist = getHaversineDistance(lat, lng, item.latitude, item.longitude);
    if (dist <= radiusKm) {
      item.distanceKm = dist;
      results.push(item);
    }
  }

  results.sort((a, b) => a.distanceKm - b.distanceKm);
  return results;
}

/**
 * Filters a list of results based on multi-criteria.
 * @param {Array<Object>} results - Results to filter
 * @param {Object} filters - Filter object: { minPrice, maxPrice, minBeds, maxBeds, propertyTypes }
 * @returns {Array<Object>} Filtered results
 */
function filterProperties(results, filters) {
  return results.filter(p => {
    if (filters.minPrice != null && (p.price == null || p.price < filters.minPrice)) return false;
    if (filters.maxPrice != null && (p.price != null && p.price > filters.maxPrice)) return false;
    if (filters.minBeds != null && (p.bedrooms == null || p.bedrooms < filters.minBeds)) return false;
    if (filters.maxBeds != null && (p.bedrooms != null && p.bedrooms > filters.maxBeds)) return false;
    if (filters.propertyTypes && filters.propertyTypes.length > 0) {
      if (!filters.propertyTypes.includes(p.propertyType)) return false;
    }
    return true;
  });
}

/**
 * Gets the top N properties based on sorting criteria.
 * @param {Array<Object>} results - The properties
 * @param {number} n - Number of items to return
 * @param {string} sortBy - Sort criteria ('price_asc' | 'price_desc' | 'beds_desc' | 'distance_asc')
 * @returns {Array<Object>} Top N properties
 */
function getTopN(results, n, sortBy) {
  if (results.length <= n) {
    let sorted = [...results];
    if (sortBy === 'price_asc') sorted.sort((a, b) => (a.price || Infinity) - (b.price || Infinity));
    else if (sortBy === 'price_desc') sorted.sort((a, b) => (b.price || -Infinity) - (a.price || -Infinity));
    else if (sortBy === 'beds_desc') sorted.sort((a, b) => (b.bedrooms || 0) - (a.bedrooms || 0));
    else if (sortBy === 'distance_asc') sorted.sort((a, b) => (a.distanceKm || 0) - (b.distanceKm || 0));
    return sorted;
  }

  // Min-heap optimization for distance sorting on large result sets
  // (Maintained as a max-heap of size n to keep the smallest n elements)
  if (sortBy === 'distance_asc') {
    const maxHeap = [];
    for (let i = 0; i < results.length; i++) {
      const item = results[i];
      if (maxHeap.length < n) {
        maxHeap.push(item);
        let idx = maxHeap.length - 1;
        while (idx > 0) {
          let parent = Math.floor((idx - 1) / 2);
          if (maxHeap[idx].distanceKm > maxHeap[parent].distanceKm) {
            let tmp = maxHeap[idx]; maxHeap[idx] = maxHeap[parent]; maxHeap[parent] = tmp;
            idx = parent;
          } else break;
        }
      } else if (item.distanceKm < maxHeap[0].distanceKm) {
        maxHeap[0] = item;
        let idx = 0;
        let length = maxHeap.length;
        while (true) {
          let left = 2 * idx + 1;
          let right = 2 * idx + 2;
          let swap = null;
          if (left < length && maxHeap[left].distanceKm > maxHeap[idx].distanceKm) swap = left;
          if (right < length && maxHeap[right].distanceKm > (swap === null ? maxHeap[idx].distanceKm : maxHeap[left].distanceKm)) swap = right;
          if (swap === null) break;
          let tmp = maxHeap[idx]; maxHeap[idx] = maxHeap[swap]; maxHeap[swap] = tmp;
          idx = swap;
        }
      }
    }
    // Return sorted heap elements
    maxHeap.sort((a, b) => (a.distanceKm || 0) - (b.distanceKm || 0));
    return maxHeap;
  }

  // Fallback default sorting
  let sorted = [...results];
  if (sortBy === 'price_asc') sorted.sort((a, b) => (a.price || Infinity) - (b.price || Infinity));
  else if (sortBy === 'price_desc') sorted.sort((a, b) => (b.price || -Infinity) - (a.price || -Infinity));
  else if (sortBy === 'beds_desc') sorted.sort((a, b) => (b.bedrooms || 0) - (a.bedrooms || 0));
  
  return sorted.slice(0, n);
}

/**
 * Clears the R-tree and map.
 */
function clearTree() {
  if (tree) tree.clear();
  propertyById.clear();
}

module.exports = {
  initTree,
  insertProperties,
  queryBoundingBox,
  queryRadius,
  filterProperties,
  getTopN,
  clearTree,
  getPropertyById: (id) => propertyById.get(id)
};

if (typeof window !== 'undefined') {
  window.rtree = module.exports;
}
