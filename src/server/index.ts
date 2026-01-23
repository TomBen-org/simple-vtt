import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { setupWebSocket } from './websocket';
import { getUploadsDir, ensureDataDir } from './persistence';

const app = express();
const PORT = process.env.PORT || 30000;

ensureDataDir();

app.use(express.json());

app.use(express.static(path.join(process.cwd(), 'public')));
app.use('/dist/client', express.static(path.join(process.cwd(), 'dist/client')));
app.use('/uploads', express.static(getUploadsDir()));

app.post('/api/upload', express.raw({ type: 'image/*', limit: '10mb' }), (req, res) => {
  const contentType = req.headers['content-type'] || 'image/png';
  const extension = contentType.split('/')[1] || 'png';
  const filename = `${uuidv4()}.${extension}`;
  const filepath = path.join(getUploadsDir(), filename);

  fs.writeFileSync(filepath, req.body);

  res.json({ url: `uploads/${filename}` });
});

const server = createServer(app);
const wss = new WebSocketServer({ server });

setupWebSocket(wss);

wss.on('listening', () => {
  console.log('WebSocket server ready');
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
