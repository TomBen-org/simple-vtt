---
layout: default
title: Home
---

# Simple VTT Documentation

Simple VTT is a lightweight Virtual Table Top application for tabletop RPG games. It runs in your browser and syncs in real-time across all connected players.

![Simple VTT Screenshot](assets/screenshot.png)

## Key Features

- **No Login Required** - Everyone can join and participate immediately
- **Real-time Sync** - All changes sync instantly via WebSocket
- **Multiple Scenes** - Create and switch between different maps and encounters
- **Measurement Tools** - Line, circle, and cone measurements visible to all players
- **Grid System** - Configurable grid with snap-to-grid and alignment tools

## Getting Started

- **[User Guide](user-guide)** - Learn how to use Simple VTT as a player or GM
- **[Hosting Guide](hosting)** - Instructions for running your own server

## Quick Start

If you just want to run the server locally:

```bash
git clone https://github.com/TomBen-org/simple-vtt.git
cd simple-vtt
npm install
npm run build
npm start
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.
