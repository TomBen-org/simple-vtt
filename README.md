# Simple VTT

A lightweight Virtual Table Top for tabletop RPG games. No login required, real-time sync across all connected players.

![Simple VTT Screenshot](docs/assets/screenshot.png)

## Features

- **Real-time Sync** - All changes instantly sync across connected browsers
- **Tokens** - Upload images as tokens, drag to move with distance display
- **Maps** - Upload background map images
- **Grid Overlay** - Configurable grid with alignment tool
- **Measurement Tools** - Line, circle, and cone measurements (synced to all players)
- **Multiple Scenes** - Manage multiple scenes with different maps and tokens
- **No Login Required** - All users have full access

## Quick Start

```bash
npm install
npm run build
npm start
```

Open http://localhost:3000 in your browser.

## Documentation

Full documentation is available at: **[Documentation Site](https://tomben-org.github.io/simple-vtt/)**

- [User Guide](https://tomben-org.github.io/simple-vtt/user-guide) - How to use the VTT
- [Hosting Guide](https://tomben-org.github.io/simple-vtt/hosting) - Self-hosting instructions

## Tech Stack

- **Backend**: Node.js, Express, WebSocket
- **Frontend**: Vanilla TypeScript, HTML5 Canvas
- **Persistence**: JSON file storage

## License

MIT
