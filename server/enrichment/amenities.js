const express = require('express');
const axios = require('axios');
const router = express.Router();

router.post('/amenities', async (req, res) => {
  try {
    const { lat, lng, radiusMeters, bounds } = req.body;
    let query = '';

    if (lat !== undefined && lng !== undefined && radiusMeters !== undefined) {
      // Local Area query (radius)
      query = `[out:json];node(around:${radiusMeters},${lat},${lng})[amenity~"cafe|restaurant|gym|pharmacy|supermarket|school"];out;`;
    } else if (bounds && bounds.south !== undefined && bounds.west !== undefined && bounds.north !== undefined && bounds.east !== undefined) {
      // Map Layer query (bounding box)
      query = `[out:json];node(${bounds.south},${bounds.west},${bounds.north},${bounds.east})[amenity~"cafe|supermarket"];out 100;`;
    } else {
      return res.status(400).json({ error: 'Missing lat/lng/radiusMeters or bounds' });
    }

    const response = await axios.post('https://overpass-api.de/api/interpreter', `data=${encodeURIComponent(query)}`, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'PropQuest-Local-App/1.0'
      },
      timeout: 20000
    });

    const elements = response.data.elements || [];

    if (lat !== undefined) {
      // Aggregate for radius query
      const counts = { cafe: 0, restaurant: 0, gym: 0, pharmacy: 0, supermarket: 0, school: 0 };
      elements.forEach(el => {
        const type = el.tags?.amenity;
        if (counts[type] !== undefined) {
          counts[type]++;
        }
      });
      return res.json({ counts });
    } else {
      // Return raw nodes for map layer
      const nodes = elements.map(el => ({
        id: el.id,
        lat: el.lat,
        lng: el.lon,
        amenity: el.tags?.amenity,
        name: el.tags?.name || ''
      }));
      return res.json({ nodes });
    }

  } catch (err) {
    console.error('Amenities API Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch amenities data' });
  }
});

module.exports = function(app) {
  app.use('/', router);
};
