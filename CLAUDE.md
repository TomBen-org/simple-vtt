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

- **Tokens**: Upload PNG images as tokens, drag to move with distance display (default 1x1 grid size)
- **Token Sizes**: Tokens are sized in grid units (1x1, 2x2, etc.) and scale automatically when grid size changes
- **Maps**: Upload background map images
- **Grid**: Optional grid overlay with configurable size and offset
- **Grid Alignment Tool**: Draw a box over one map cell to auto-configure grid size and alignment
- **Snap to Grid**: Toggle snap-to-grid for token movement (Ctrl temporarily inverts the setting)
- **Measurement Tools**: Line, circle, and cone measurement tools (1 grid cell = 5 feet)
- **Synchronized Measurements**: Measurements sync in real-time to all connected players (purple for remote, yellow for local)
- **Token Highlighting**: Tokens touched by any measurement glow orange
- **Real-time Sync**: All changes sync instantly across connected browsers via WebSocket
- **No Login**: All users have full access to all features
- **Pan and Zoom**: using right mouse button hold and scroll wheel
- **Token Context Menu**: Right-click tokens to resize (1x1, 2x2, 3x3, 4x4 grid) or delete

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

1. **Select** - Click tokens to select, drag to move (shows distance). Snaps to grid if enabled.
2. **Measure Line** - Click and drag to measure distances
3. **Measure Circle** - Click center, drag for radius
4. **Measure Cone** - Click origin, drag for 60-degree cone
5. **Align** - Draw a box over one grid cell on the map to set grid size and offset

## Configuration

- Grid size and visibility configurable in UI
- Snap-to-grid toggle in UI (Ctrl key temporarily inverts)
- Distance is always 5 feet per grid cell

## Planned features
- garbage collect unused images
- dragging an image into the map adds it as a token automatically
- ux for tweaking for grid offset
- use floating point for grid scale and grid offset
- ux increasing and decreasing grid scale and grid offset should go up and down by 1, and you should be able to type fractional values
- support for uploading multiple map images, each map on a different scene
- UX for swapping between scenes, deleting scenes, and moving tokens between scenes

## Extra instructions for Claude
- If necessary, update this file after implementing each feature, or having a discussion about features.
- Always ask questions in planning mode before building your implementation strategy