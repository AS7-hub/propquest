const axios = require('axios');
const cheerio = require('cheerio');
const { globalCache } = require('../cache');

function validateRightmoveUrl(url) {
  return typeof url === 'string' && url.startsWith('https://www.rightmove.co.uk');
}

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html',
  'Accept-Language': 'en-GB'
};

module.exports = function(app) {
  // 1. POST /rightmoveMap
  app.post('/rightmoveMap', async (req, res) => {
    try {
      const url = req.body;
      if (!validateRightmoveUrl(url)) {
        return res.status(400).json({ error: 'Invalid Rightmove URL' });
      }

      if (globalCache.has(url)) {
        console.log(`[CACHE HIT] rightmoveMap: ${url}`);
        return res.json(globalCache.get(url));
      }
      console.log(`[CACHE MISS] rightmoveMap: ${url}`);

      const response = await axios.get(url, { headers: HEADERS });
      const html = response.data;
      const { debugHtml, regexFallback } = require('./utils');
      debugHtml('rightmove', html);

      const $ = cheerio.load(html);
      const nextData = $('script#__NEXT_DATA__').html();
      let features = [];
      let usingGeoJson = false;

      try {
        if (nextData) {
          const jsonData = JSON.parse(nextData);
          const geoProps = jsonData.props?.pageProps?.searchResults?.geoJsonProperties;
          if (geoProps && geoProps.features) {
            features = geoProps.features;
            usingGeoJson = true;
          } else {
            features = jsonData.props?.pageProps?.properties || [];
          }
        } else {
          const scriptTag = $('script:contains("jsonModel")').text();
          if (scriptTag) {
            const parts = scriptTag.split('window.jsonModel = ');
            if (parts.length >= 2) {
              const jsonStr = parts[1].split(';')[0];
              const jsonData = JSON.parse(jsonStr);
              features = jsonData.properties || [];
            }
          }
        }

        if (!features || features.length === 0) {
          throw new Error('No properties found via primary extraction');
        }

        const normalizedProperties = features.map(f => {
          if (usingGeoJson && f.properties) {
             const p = f.properties;
             const coords = f.geometry?.coordinates || [];
             return {
               id: p.id,
               latitude: coords[1] || p.location?.latitude || null,
               longitude: coords[0] || p.location?.longitude || null,
               price: p.price ? p.price.amount : null,
               bedrooms: p.bedrooms,
               propertyType: p.propertySubType || p.propertyType,
               source: 'rightmove',
               url: p.propertyUrl ? `https://www.rightmove.co.uk${p.propertyUrl}` : url
             };
          }
          
          return {
            id: f.id,
            latitude: f.location ? f.location.latitude : null,
            longitude: f.location ? f.location.longitude : null,
            price: f.price ? f.price.amount : null,
            bedrooms: f.bedrooms,
            propertyType: f.propertySubType || f.propertyType,
            source: 'rightmove',
            url: f.propertyUrl ? `https://www.rightmove.co.uk${f.propertyUrl}` : url
          };
        });

        globalCache.set(url, normalizedProperties);
        res.json(normalizedProperties);
      } catch (e) {
        console.warn('Rightmove primary extraction failed, trying regex fallback...', e.message);
        const fallbackProperties = regexFallback(html, 'rightmove', url);
        if (fallbackProperties.length > 0) {
          globalCache.set(url, fallbackProperties);
          return res.json(fallbackProperties);
        }
        throw new Error('Both primary extraction and regex fallback failed.');
      }
    } catch (err) {
      console.error('Rightmove Map Scraper Error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // 2. POST /rightmoveProperty
  app.post('/rightmoveProperty', async (req, res) => {
    try {
      const url = req.body;
      if (!validateRightmoveUrl(url)) {
        return res.status(400).json({ error: 'Invalid Rightmove URL' });
      }

      if (globalCache.has(url)) {
        console.log(`[CACHE HIT] rightmoveProperty: ${url}`);
        return res.json(globalCache.get(url));
      }
      console.log(`[CACHE MISS] rightmoveProperty: ${url}`);

      const response = await axios.get(url, { headers: HEADERS });
      const $ = cheerio.load(response.data);
      
      const scriptTag = $('script:contains("PAGE_MODEL")').text();
      if (!scriptTag) {
        throw new Error('PAGE_MODEL not found in the page');
      }

      // Extract the full propertyData object
      const parts = scriptTag.split('window.PAGE_MODEL = ');
      if (parts.length < 2) {
        throw new Error('Could not parse window.PAGE_MODEL assignment');
      }

      const jsonStr = parts[1].split(';')[0];
      const propertyData = JSON.parse(jsonStr);

      // Return the raw propertyData JSON
      const finalData = propertyData.propertyData || propertyData;
      globalCache.set(url, finalData);
      res.json(finalData);
    } catch (err) {
      console.error('Rightmove Property Scraper Error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });
};
