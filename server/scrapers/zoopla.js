const axios = require('axios');
const cheerio = require('cheerio');
const { globalCache } = require('../cache');

function validateZooplaUrl(url) {
  return typeof url === 'string' && url.startsWith('https://www.zoopla.co.uk');
}

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html',
  'Accept-Language': 'en-GB'
};

module.exports = function(app) {
  // 1. POST /zooplaMap
  app.post('/zooplaMap', async (req, res) => {
    try {
      const url = req.body;
      if (!validateZooplaUrl(url)) {
        return res.status(400).json({ error: 'Invalid Zoopla URL' });
      }

      if (globalCache.has(url)) {
        console.log(`[CACHE HIT] zooplaMap: ${url}`);
        return res.json(globalCache.get(url));
      }
      console.log(`[CACHE MISS] zooplaMap: ${url}`);

      const { chromium } = require('playwright');
      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({ userAgent: HEADERS['User-Agent'] });
      const page = await context.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const html = await page.content();
      await browser.close();

      const { debugHtml, regexFallback } = require('./utils');
      debugHtml('zoopla', html);

      const $ = cheerio.load(html);
      
      try {
        const jsonStr = $('script#__NEXT_DATA__').html();
        if (!jsonStr) {
          throw new Error('__NEXT_DATA__ not found');
        }

        let data;
        try {
          data = JSON.parse(jsonStr);
        } catch (e) {
          throw new Error('Zoopla JSON parse error: ' + e.message);
        }

        let listings = [];
        try {
          // Navigate through the Next.js props structure to find regular and featured listings
          const regular = data?.props?.pageProps?.listings?.regular || [];
          const featured = data?.props?.pageProps?.listings?.featured || [];
          listings = [...featured, ...regular];
        } catch (e) {
          throw new Error('Zoopla data navigation error: ' + e.message);
        }

        if (!listings || listings.length === 0) {
           throw new Error('No properties found via primary extraction');
        }

        const normalizedProperties = listings.map(listing => {
          return {
            id: listing.listingId || listing.id,
            latitude: listing.location?.coordinates?.latitude || null,
            longitude: listing.location?.coordinates?.longitude || null,
            price: listing.pricing?.label || null,
            bedrooms: listing.features?.bedrooms || listing.bedrooms || null,
            propertyType: listing.propertyType || null,
            source: 'zoopla',
            url: listing.listingUris?.detail 
              ? `https://www.zoopla.co.uk${listing.listingUris.detail}` 
              : url
          };
        });

        globalCache.set(url, normalizedProperties);
        res.json(normalizedProperties);
      } catch (e) {
        console.warn('Zoopla primary extraction failed, trying regex fallback...', e.message);
        const fallbackProperties = regexFallback(html, 'zoopla', url);
        if (fallbackProperties.length > 0) {
          globalCache.set(url, fallbackProperties);
          return res.json(fallbackProperties);
        }
        throw new Error('Both primary extraction and regex fallback failed.');
      }
    } catch (err) {
      console.error('Zoopla Map Scraper Error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // 2. POST /zooplaProperty
  app.post('/zooplaProperty', async (req, res) => {
    try {
      const url = req.body;
      if (!validateZooplaUrl(url)) {
        return res.status(400).json({ error: 'Invalid Zoopla URL' });
      }

      if (globalCache.has(url)) {
        console.log(`[CACHE HIT] zooplaProperty: ${url}`);
        return res.json(globalCache.get(url));
      }
      console.log(`[CACHE MISS] zooplaProperty: ${url}`);

      const response = await axios.get(url, { headers: HEADERS });
      const $ = cheerio.load(response.data);
      
      const jsonStr = $('script#__NEXT_DATA__').html();
      if (!jsonStr) {
        throw new Error('__NEXT_DATA__ not found');
      }

      let data;
      try {
        data = JSON.parse(jsonStr);
      } catch (e) {
        console.error('Zoopla JSON parse error:', e.message);
        return res.json({});
      }

      let listingDetails = {};
      try {
        // Navigate to the specific listing object for property details
        listingDetails = data?.props?.pageProps?.listing || {};
      } catch (e) {
        console.error('Zoopla listing data navigation error:', e.message);
        return res.json({});
      }

      // Return the full listing object
      globalCache.set(url, listingDetails);
      res.json(listingDetails);
    } catch (err) {
      console.error('Zoopla Property Scraper Error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });
};
