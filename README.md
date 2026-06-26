# PropQuest — UK Property Search

A desktop app that aggregates property listings from Rightmove and Zoopla
onto a single interactive map, powered by an R-tree spatial index.

## Quick Start
npm install
npm run build:css
npm start

## Tech Stack
Electron · Express · Leaflet · rbush R-tree · Tailwind CSS · Axios · Cheerio

## How It Works
1. Paste a Rightmove or Zoopla search URL
2. The Express server scrapes property locations
3. Results are indexed in an R-tree for fast spatial queries
4. Leaflet renders them on an OpenStreetMap base layer
5. Use filters to narrow down by price, beds, property type
