import { WebSocket, WebSocketServer } from 'ws';
import { WSMessage } from '../shared/types';
import { stateManager } from './state';

let wss: WebSocketServer;

export function setupWebSocket(server: WebSocketServer): void {
  wss = server;

  wss.on('error', (error) => {
    console.error('WebSocket server error:', error);
  });

  wss.on('connection', (ws: WebSocket, req) => {
    console.log('Client connected from', req.socket.remoteAddress);

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

    case 'token:resize':
      if (stateManager.resizeToken(message.id, message.gridWidth, message.gridHeight)) {
        broadcast(message);
      }
      break;

    case 'map:set':
      stateManager.setMapBackground(message.backgroundUrl);
      broadcast(message);
      break;

    case 'map:grid':
      stateManager.setGridSettings(message.enabled, message.size, message.offsetX, message.offsetY);
      broadcast(message);
      break;

    case 'measurement:update':
      broadcast(message);
      break;

    case 'measurement:clear':
      broadcast(message);
      break;

    case 'scene:create':
      const newScene = stateManager.createScene(message.scene.name, message.scene.map.backgroundUrl || undefined);
      stateManager.switchScene(newScene.id);
      broadcast({ type: 'scene:create', scene: newScene });
      broadcast({ type: 'scene:switch', sceneId: newScene.id });
      break;

    case 'scene:delete':
      if (stateManager.deleteScene(message.sceneId)) {
        // Also broadcast the new active scene in case it changed
        broadcast(message);
        broadcast({ type: 'scene:switch', sceneId: stateManager.getState().activeSceneId });
      }
      break;

    case 'scene:switch':
      if (stateManager.switchScene(message.sceneId)) {
        broadcast(message);
      }
      break;

    case 'scene:rename':
      if (stateManager.renameScene(message.sceneId, message.name)) {
        broadcast(message);
      }
      break;

    case 'sync':
      break;

    case 'draw:stroke':
      // Broadcast stroke to all other clients for real-time preview
      broadcastExcept(message, sender);
      break;

    case 'draw:chunk':
      // Save chunk and broadcast to all clients
      const chunkVersion = stateManager.updateDrawingChunk(message.sceneId, message.chunkKey, message.data);
      broadcast({ ...message, version: chunkVersion });
      break;

    case 'draw:sync-request':
      // Send full drawing layer to requesting client
      const drawingLayer = stateManager.getDrawingLayer(message.sceneId);
      const syncResponse: WSMessage = {
        type: 'draw:sync',
        sceneId: message.sceneId,
        chunks: drawingLayer.chunks,
        version: drawingLayer.version,
      };
      sender.send(JSON.stringify(syncResponse));
      break;

    case 'draw:clear':
      stateManager.clearDrawingLayer(message.sceneId);
      broadcast(message);
      break;

    case 'token:move-to-scene':
      if (stateManager.moveTokenToScene(message.tokenId, message.targetSceneId)) {
        broadcast(message);
      }
      break;

    case 'token:drag:update':
      // Broadcast drag preview to all other clients
      broadcastExcept(message, sender);
      break;

    case 'token:drag:clear':
      // Broadcast drag clear to all other clients
      broadcastExcept(message, sender);
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

function broadcastExcept(message: WSMessage, exclude: WebSocket): void {
  const data = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client !== exclude && client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}
