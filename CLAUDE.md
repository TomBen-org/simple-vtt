# Simple VTT

A lightweight Virtual Table Top application for tabletop RPG games.

## Quick Start

```bash
npm install
npm run build
npm start
```

Open http://localhost:3000 in your browser.

## Features

- **Tokens**: Upload PNG images as tokens, drag to move with distance display
- **Maps**: Upload background map images
- **Scale**: Configure pixels-to-feet ratio for distance calculations
- **Grid**: Optional grid overlay (toggleable)
- **Measurement Tools**: Line, circle, and cone measurement tools
- **Real-time Sync**: All changes sync instantly across connected browsers via WebSocket
- **No Login**: All users have full access to all features
- **Pan and Zoom**: using right mouse button hold and scroll wheel

## Tech Stack

- **Backend**: Node.js, Express, WebSocket (ws)
- **Frontend**: Vanilla TypeScript, HTML5 Canvas
- **Persistence**: JSON file storage in /data directory

## Project Structure

- `src/server/` - Express server and WebSocket handling
- `src/client/` - Browser-side TypeScript
- `src/shared/` - Shared type definitions
- `public/` - Static HTML/CSS
- `data/` - Persisted game state and uploaded images

## npm Scripts

- `npm run build` - Compile TypeScript
- `npm run build:server` - Compile server only
- `npm run build:client` - Compile client only
- `npm start` - Run the server
- `npm run dev` - Build and run

## Architecture

The server maintains authoritative game state. All client actions are sent to the server via WebSocket, which updates state and broadcasts to all clients. State persists to `data/state.json`.

## Tools

1. **Select** - Click tokens to select, drag to move (shows distance)
2. **Measure Line** - Click and drag to measure distances
3. **Measure Circle** - Click center, drag for radius
4. **Measure Cone** - Click origin, drag for 60-degree cone

## Configuration

- Grid size and visibility configurable in UI
- Pixels-per-foot scale configurable in UI

## Planned features
- synchronise measuring tools so other players can see them
- highlight tokens that are touched by a line, cone or circle measurement
- toggle to snap tokens to grid during movement
- grid alignment tool, where the user draws a box and the grid offset and size is set based on it
- feet distance based on grid size, not pixels
- garbage collect unused images
- dragging an image into the map adds it as a token automatically
- scale all new tokens to one grid size
- a right click menu on tokens to increase/decrease size (1x1grid, 2x2grid, ect..), and an option to delete the token.

## Extra instructions for Claude
- If necessary, update this file after implementing each feature, or having a discussion about features.