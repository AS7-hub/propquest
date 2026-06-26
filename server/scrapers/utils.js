const fs = require('fs');
const os = require('os');
const path = require('path');
const cheerio = require('cheerio');

function debugHtml(source, html) {
  if (process.env.DEBUG === 'true') {
    const p = path.join(os.tmpdir(), `propquest-debug-${source}.html`);
    fs.writeFileSync(p, html);
    console.log(`[DEBUG] Wrote raw HTML to ${p}`);
  }
}

function regexFallback(html, source, url) {
  const $ = cheerio.load(html);
  const properties = [];
  
  $('script').each((i, el) => {
    const text = $(el).text();
    if (!text || text.length < 50) return;
    
    // Sometimes properties are just loose JSON objects in JS variables
    // Look for "latitude": 51.123, "longitude": -0.123
    const latRegex = /["']?latitude["']?\s*:\s*([\d.-]+)/g;
    const lngRegex = /["']?longitude["']?\s*:\s*([\d.-]+)/g;
    
    // Instead of matching pairs (which is hard if they are far apart in the object),
    // let's try to parse out chunks that look like JSON objects containing coordinates.
    // But a simple regex for the whole block is better if we just want coordinates.
    // The prompt says: JSON.stringify all <script> tags and grep for latitude/longitude patterns.
    // We will just regex the raw stringified text.
    const strText = JSON.stringify(text);
    
    const latLngPattern = /\\"latitude\\"\s*:\s*([\d.-]+).*?\\"longitude\\"\s*:\s*([\d.-]+)/g;
    let match;
    while ((match = latLngPattern.exec(strText)) !== null) {
      properties.push({
        id: Math.floor(Math.random() * 1000000000), // Fake ID
        latitude: parseFloat(match[1]),
        longitude: parseFloat(match[2]),
        price: 'Unknown (Fallback)',
        bedrooms: null,
        propertyType: 'Unknown',
        source: source,
        url: url
      });
    }
  });
  
  return properties;
}

module.exports = { debugHtml, regexFallback };
