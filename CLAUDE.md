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
- **Grid Alignment Tool**: Draw a box over multiple map cells, then enter the cell count to auto-configure grid size and alignment
- **Snap to Grid**: Toggle snap-to-grid for token movement (Ctrl temporarily inverts the setting)
- **Measurement Tools**: Line, circle, and cone measurement tools (1 grid cell = 5 feet)
- **Synchronized Measurements**: Measurements sync in real-time to all connected players (purple for remote, yellow for local)
- **Token Highlighting**: Tokens touched by any measurement glow orange
- **Real-time Sync**: All changes sync instantly across connected browsers via WebSocket
- **No Login**: All users have full access to all features
- **Pan and Zoom**: using right mouse button hold and scroll wheel
- **Token Context Menu**: Right-click tokens to resize (1x1, 2x2, 3x3, 4x4 grid), duplicate, move to another scene, or delete
- **Multiple Scenes**: Support for multiple scenes, each with its own map, tokens, and grid settings. All clients view the same active scene (shared view).
- **Drag-and-Drop Tokens**: Drag image files (PNG, JPEG, GIF, WebP) onto the canvas to create tokens at the drop position. Multiple files are arranged in a grid pattern.
- **Drawing Layer**: Paint/draw on a layer above the map but below tokens. Includes brush, eraser, shapes (line, rect, ellipse), and fill bucket tools. Drawings sync in real-time and persist per-scene. Two separate layers: DM layer (below) and Player layer (above). Layer routing is automatic based on DM mode toggle. Erase affects own layer only. DM Clear All clears both layers; player Clear All clears player layer only. Draw tools available to all clients; opacity slider is DM-only. Draw section stays open when switching to regular tools.
- **Touch Support**: Mobile-friendly interface with automatic detection. Touch devices get a simplified 5-button toolbar (Pan/Zoom, Line, Circle, Cone, Fullscreen) with pinch-to-zoom, one-finger pan, and long-press to drag tokens.
- **Synchronized Token Dragging**: When dragging tokens, a ghost preview syncs in real-time to other connected players (purple dashed border, 50% opacity).
- **Garbage Collection**: Server automatically cleans up orphaned uploads and drawing directories on startup.

## Tech Stack

- **Backend**: Node.js, Express, WebSocket (ws)
- **Frontend**: Vanilla TypeScript, HTML5 Canvas
- **Persistence**: JSON file storage in /data directory

## Project Structure

- `src/server/` - Express server and WebSocket handling
- `src/client/` - Browser-side TypeScript
- `src/shared/` - Shared type definitions
- `public/` - Static HTML/CSS
- `data/` - Persisted game state, uploaded images, and drawing chunks (PNG files in data/drawings/{sceneId}/)

## npm Scripts

- `npm run build` - Compile TypeScript
- `npm run build:server` - Compile server only
- `npm run build:client` - Compile client only
- `npm start` - Run the server
- `npm run dev` - Build and run

## Architecture

The server maintains authoritative game state. All client actions are sent to the server via WebSocket, which updates state and broadcasts to all clients. State persists to `data/state.json`.

## Tools

1. **Move** - Click tokens to select, drag to move (shows distance). Snap toggle next to it controls grid snapping (Ctrl temporarily inverts).
2. **Measure Line** - Click and drag to measure distances
3. **Measure Circle** - Click center, drag for radius
4. **Measure Cone** - Click origin, drag for 60-degree cone
5. **Align** - In the Grid settings panel. Draw a box over multiple grid cells, then enter the cell count along the longest side. Uses the starting corner for offset alignment.

## Draw Mode

Toggle Draw Mode button to reveal drawing tools. When enabled, mouse events draw instead of moving tokens.

- **Brush** - Freehand drawing with selected color and size
- **Eraser** - Erase parts of the drawing
- **Line** - Click and drag to draw straight lines
- **Rect** - Click and drag to draw filled rectangles
- **Ellipse** - Click and drag to draw filled ellipses
- **Fill** - Click to flood fill an area with the selected color (expands 3px past edges to cover antialiasing)
- **Pick** - Click to sample a color from the canvas (samples from merged view including background, drawings, and tokens)
- **Color picker** - Select drawing color
- **Size slider** - Adjust brush/eraser size (1-100)
- **Clear All** - Remove all drawing from the current scene (with confirmation)

## Configuration

- **Grid section** (collapsible): Toggle visibility, configure size and offset (X/Y) with +/- buttons or direct input. Supports floating-point values.
- **Snap toggle**: Next to the Move tool. Ctrl key temporarily inverts the setting. This is a client-side only setting (not synced).
- **Scene selector**: Dropdown to switch between scenes, with buttons to add (+), rename, and delete scenes. When uploading a map, you can choose to create a new scene or replace the current background.
- Distance is always 5 feet per grid cell

## Mobile/Touch Mode

The app automatically detects touch input and switches to a mobile-optimized UI:

- **Automatic detection**: Uses `(pointer: coarse)` media query on load, then dynamically switches based on actual input type (touch vs mouse)
- **Mobile toolbar**: 5 large (50px) buttons with SVG icons: Pan/Zoom, Line, Circle, Cone, Fullscreen
- **Pan/Zoom mode**: One-finger drag to pan, pinch with two fingers to zoom. Long-press on a token to start dragging it.
- **Token dragging**: In pan-zoom mode, long-press on a token to drag it. Returns to pan-zoom mode when released.
- **Measurement tools**: Touch and drag to measure with line, circle, or cone
- **Fullscreen button**: Toggle fullscreen mode for immersive play
- **Landscape layout**: In landscape orientation, toolbar moves to left side vertically
- **No context menu**: Right-click context menu is disabled on mobile
- **No drawing mode**: Drawing tools are hidden on mobile
- **Switching back**: Using a mouse automatically switches back to desktop mode

## Documentation

- `README.md` - Project overview for GitHub
- `docs/` - GitHub Pages documentation site (Jekyll)
  - `index.md` - Documentation home
  - `user-guide.md` - How to use the VTT
  - `hosting.md` - Self-hosting instructions

To enable GitHub Pages: repo Settings → Pages → Deploy from branch → main, /docs folder.

## TODOS
(none)

## Extra instructions for Claude
- If necessary, update this file after implementing each feature, or having a discussion about features.
- Always ask questions in planning mode before building your implementation strategy