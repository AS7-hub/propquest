const express = require('express');
const cors = require('cors');

const app = express();

// 2. Enable CORS for all origins
app.use(cors());

// 1. Use body-parser for text (URL strings) and JSON
app.use(express.text());
app.use(express.json());

// 3. Register route files
require('./scrapers/rightmove')(app);
require('./scrapers/zoopla')(app);
require('./enrichment/crimes')(app);
require('./enrichment/amenities')(app);

const cacheModule = require('./cache');
app.use('/', cacheModule.router);

// 4. Health check route
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// 5. Global error middleware
app.use((err, req, res, next) => {
  res.status(500).json({ error: err.message });
});

// 6. Start server and log when ready
const PORT = 3000;
const server = app.listen(PORT, () => {
  console.log(`PropQuest scraper server running on port ${PORT}`);
});

// 7. Export the server instance
module.exports = server;
