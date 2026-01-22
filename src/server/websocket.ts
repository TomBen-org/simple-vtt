import { WebSocket, WebSocketServer } from 'ws';
import { WSMessage } from '../shared/types';
import { stateManager } from './state';

let wss: WebSocketServer;

export function setupWebSocket(server: WebSocketServer): void {
  wss = server;

  wss.on('connection', (ws: WebSocket) => {
    console.log('Client connected');

    const syncMessage: WSMessage = {
      type: 'sync',
      state: stateManager.getState(),
    };
    ws.send(JSON.stringify(syncMessage));

    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString()) as WSMessage;
        handleMessage(message, ws);
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    });

    ws.on('close', () => {
      console.log('Client disconnected');
    });
  });
}

function handleMessage(message: WSMessage, sender: WebSocket): void {
  switch (message.type) {
    case 'token:add':
      stateManager.addToken(message.token);
      broadcast(message);
      break;

    case 'token:move':
      if (stateManager.moveToken(message.id, message.x, message.y)) {
        broadcast(message);
      }
      break;

    case 'token:remove':
      if (stateManager.removeToken(message.id)) {
        broadcast(message);
      }
      break;

    case 'map:set':
      stateManager.setMapBackground(message.backgroundUrl);
      broadcast(message);
      break;

    case 'map:scale':
      stateManager.setMapScale(message.pixelsPerFoot);
      broadcast(message);
      break;

    case 'map:grid':
      stateManager.setGridSettings(message.enabled, message.size);
      broadcast(message);
      break;

    case 'measurement:update':
      broadcast(message);
      break;

    case 'measurement:clear':
      broadcast(message);
      break;

    case 'sync':
      break;
  }
}

function broadcast(message: WSMessage): void {
  const data = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}
