const fs = require('fs');
const html = fs.readFileSync('rightmove_test.html', 'utf8');
const cheerio = require('cheerio');
const $ = cheerio.load(html);
const nextData = $('script#__NEXT_DATA__').html();
if (nextData) {
  const jsonData = JSON.parse(nextData);
  console.log('Props keys:', Object.keys(jsonData.props || {}));
  console.log('pageProps keys:', Object.keys(jsonData.props?.pageProps || {}));
  const searchResults = jsonData.props?.pageProps?.searchResults || {};
  const geoProps = searchResults.geoJsonProperties;
  if (geoProps) {
     console.log('geoProps type:', typeof geoProps);
     console.log('geoProps keys:', Object.keys(geoProps));
     if (geoProps.features && geoProps.features.length > 0) {
        console.log('First feature keys:', Object.keys(geoProps.features[0]));
        console.log('First feature properties:', geoProps.features[0].properties);
        console.log('First feature geometry:', geoProps.features[0].geometry);
     }
  }
} else {
  console.log('No NEXT_DATA');
}
