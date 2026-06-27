require('dotenv').config();
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

const { parseQuery } = require('./ai/queryParser');

const nlpRateLimiter = (() => {
  const calls = [];
  const WINDOW_MS = 60 * 1000;  // 1 minute window
  const MAX_CALLS = 20;          // max 20 AI calls per minute
  return (req, res, next) => {
    const now = Date.now();
    // Remove calls older than the window
    while (calls.length && calls[0] < now - WINDOW_MS) calls.shift();
    if (calls.length >= MAX_CALLS) {
      return res.status(429).json({
        error: 'Too many AI queries — wait a moment before searching again',
        retryAfterMs: WINDOW_MS - (now - calls[0])
      });
    }
    calls.push(now);
    next();
  };
})();

app.post('/parse-query', nlpRateLimiter, async (req, res) => {
  try {
    const query = req.body;
    if (!query || typeof query !== 'string' || query.trim().length < 3) {
      return res.status(400).json({ error: 'Query must be at least 3 characters' });
    }
    if (query.length > 500) {
      return res.status(400).json({ error: 'Query too long (max 500 chars)' });
    }
    const parsed = await parseQuery(query.trim());
    res.json(parsed);
  } catch (err) {
    console.error('[NLP] Parse error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

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
