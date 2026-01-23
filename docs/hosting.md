---
layout: default
title: Hosting Guide
---

# Hosting Guide

This guide covers how to run your own Simple VTT server.

## Requirements

- Node.js 18 or later
- npm

## Local Development

```bash
# Clone the repository
git clone https://github.com/TomBen-org/simple-vtt.git
cd simple-vtt

# Install dependencies
npm install

# Build the TypeScript
npm run build

# Start the server
npm start
```

The server runs on port 3000 by default. Open [http://localhost:3000](http://localhost:3000) in your browser.

### Development Mode

For active development, you can rebuild and restart in one command:

```bash
npm run dev
```

## Production Deployment

### Basic Setup

1. Clone the repository on your server
2. Run `npm install --production`
3. Run `npm run build`
4. Run `npm start`

### Using a Process Manager

For production, use a process manager like PM2 to keep the server running:

```bash
# Install PM2 globally
npm install -g pm2

# Start the server
pm2 start dist/server/index.js --name simple-vtt

# Save the process list to restart on reboot
pm2 save
pm2 startup
```

### Reverse Proxy with Nginx

If running behind Nginx, you need to configure WebSocket proxying:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Docker

Create a `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
```

Build and run:

```bash
docker build -t simple-vtt .
docker run -p 3000:3000 -v $(pwd)/data:/app/data simple-vtt
```

The `-v` flag mounts the data directory so your game state persists between container restarts.

## Data Storage

All game data is stored in the `/data` directory:

- `state.json` - Game state (tokens, scenes, grid settings)
- `images/` - Uploaded token and map images

### Backup

To backup your game, simply copy the entire `/data` directory.

### Reset

To reset the game to a fresh state, stop the server and delete the `/data` directory. A new one will be created on next startup.

## Configuration

Currently, configuration is minimal:

- **Port**: The server runs on port 3000. To change this, modify `src/server/index.ts` and rebuild.

## Troubleshooting

### WebSocket Connection Failed

If players can load the page but tokens don't sync:
- Check that WebSocket connections aren't being blocked by a firewall
- If using a reverse proxy, ensure WebSocket upgrade headers are being passed through

### Images Not Loading

- Check that the `/data/images` directory exists and is writable
- Ensure your reverse proxy is configured to handle large file uploads if using one

### High Memory Usage

The server keeps game state in memory. If you have many large images:
- Consider resizing images before uploading
- Restart the server periodically to clear any memory leaks
