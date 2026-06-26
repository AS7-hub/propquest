const express = require('express');
const axios = require('axios');
const router = express.Router();

router.post('/crimes', async (req, res) => {
  try {
    const { lat, lng } = req.body;
    if (!lat || !lng) {
      return res.status(400).json({ error: 'Missing lat or lng' });
    }

    // Call Police UK API
    const url = `https://data.police.uk/api/crimes-at-location?lat=${lat}&lng=${lng}`;
    let response;
    
    try {
      response = await axios.get(url, { timeout: 10000 });
    } catch (err) {
      // 404 means no crimes found at this exact location for the latest month
      // 503 means rate limit or service unavailable
      if (err.response && err.response.status === 404) {
        return res.json({ total: 0, byCategory: {} });
      }
      throw err;
    }

    const crimes = response.data;
    if (!Array.isArray(crimes)) {
      return res.json({ total: 0, byCategory: {} });
    }

    const byCategory = {};
    crimes.forEach(crime => {
      const cat = crime.category;
      if (!byCategory[cat]) {
        byCategory[cat] = 0;
      }
      byCategory[cat]++;
    });

    res.json({
      total: crimes.length,
      byCategory
    });

  } catch (err) {
    console.error('Crime API Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch crime data' });
  }
});

module.exports = function(app) {
  app.use('/', router);
};
