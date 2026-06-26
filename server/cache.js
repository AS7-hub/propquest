class LRUCache {
  constructor(maxSize = 50) {
    this.maxSize = maxSize;
    this.cache = new Map();
    this.hits = 0;
    this.misses = 0;
  }

  get(key) {
    if (!this.cache.has(key)) {
      this.misses++;
      return undefined;
    }

    const item = this.cache.get(key);
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      this.misses++;
      return undefined;
    }

    // Refresh insertion order (LRU)
    this.cache.delete(key);
    this.cache.set(key, item);
    
    this.hits++;
    return item.value;
  }

  set(key, value, ttlMs = 300000) {
    if (this.cache.has(key)) {
      // Remove old entry so it gets inserted at the end
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Evict oldest (first inserted)
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    
    this.cache.set(key, {
      value,
      expiry: Date.now() + ttlMs
    });
  }

  has(key) {
    if (!this.cache.has(key)) return false;
    const item = this.cache.get(key);
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  delete(key) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  size() {
    // Clean up expired items lazily to report accurate size
    for (const [key, item] of this.cache.entries()) {
      if (Date.now() > item.expiry) {
        this.cache.delete(key);
      }
    }
    return this.cache.size;
  }

  getStats() {
    return {
      size: this.size(),
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses
    };
  }
}

// Singleton instance
const globalCache = new LRUCache(50);

// Express router for cache stats
const express = require('express');
const router = express.Router();

router.get('/cache/stats', (req, res) => {
  res.json(globalCache.getStats());
});

router.delete('/cache', (req, res) => {
  globalCache.clear();
  res.json({ message: 'Cache cleared' });
});

module.exports = {
  LRUCache,
  globalCache,
  router
};
