import { WSMessage, GameState, Token, Measurement, Scene, DEFAULT_MAP_SETTINGS, DrawStroke, ChunkKey } from '../shared/types.js';

type MessageHandler = (message: WSMessage) => void;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private handlers: MessageHandler[] = [];
  private reconnectTimeout: number | null = null;
  private isConnecting: boolean = false;

  connect(): void {
    // Don't start a new connection if one is already in progress
    if (this.isConnecting) {
      return;
    }

    // Clean up existing connection if any
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }

    // Clear any pending reconnect
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Include pathname for reverse proxy subdirectory support
    // Get directory path, ensuring it ends with / for nginx location matching
    let basePath = window.location.pathname;
    // Remove filename if present (e.g., /vtt/index.html -> /vtt/)
    if (!basePath.endsWith('/')) {
      basePath = basePath.replace(/\/[^/]*$/, '/');
    }
    const wsUrl = `${protocol}//${window.location.host}${basePath}`;

    console.log('WebSocket connecting to', wsUrl);
    this.isConnecting = true;

    try {
      this.ws = new WebSocket(wsUrl);
    } catch (error) {
      console.error('WebSocket creation failed:', error);
      this.isConnecting = false;
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.isConnecting = false;
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WSMessage;
        this.handlers.forEach(handler => handler(message));
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    this.ws.onclose = (event) => {
      console.log('WebSocket disconnected (code:', event.code, 'reason:', event.reason || 'none', ')');
      this.isConnecting = false;
      this.scheduleReconnect();
    };

    this.ws.onerror = (error) => {
      // Note: error event doesn't contain useful info in browsers for security reasons
      console.error('WebSocket error occurred');
      this.isConnecting = false;
      // Don't schedule reconnect here - onclose will fire after onerror
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      return; // Already scheduled
    }
    console.log('Scheduling reconnect in 1 second...');
    this.reconnectTimeout = window.setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect();
    }, 1000);
  }

  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  send(message: WSMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  addToken(token: Token): void {
    this.send({ type: 'token:add', token });
  }

  moveToken(id: string, x: number, y: number): void {
    this.send({ type: 'token:move', id, x, y });
  }

  removeToken(id: string): void {
    this.send({ type: 'token:remove', id });
  }

  resizeToken(id: string, gridWidth: number, gridHeight: number): void {
    this.send({ type: 'token:resize', id, gridWidth, gridHeight });
  }

  setMapBackground(backgroundUrl: string): void {
    this.send({ type: 'map:set', backgroundUrl });
  }

  setGrid(enabled: boolean, size?: number, offsetX?: number, offsetY?: number): void {
    this.send({ type: 'map:grid', enabled, size, offsetX, offsetY });
  }

  updateMeasurement(measurement: Measurement): void {
    this.send({ type: 'measurement:update', measurement });
  }

  clearMeasurement(playerId: string): void {
    this.send({ type: 'measurement:clear', playerId });
  }

  createScene(name: string, backgroundUrl?: string): void {
    const scene: Scene = {
      id: '', // Will be assigned by server
      name,
      tokens: [],
      map: {
        ...DEFAULT_MAP_SETTINGS,
        backgroundUrl: backgroundUrl || null,
      },
    };
    this.send({ type: 'scene:create', scene });
  }

  deleteScene(sceneId: string): void {
    this.send({ type: 'scene:delete', sceneId });
  }

  switchScene(sceneId: string): void {
    this.send({ type: 'scene:switch', sceneId });
  }

  renameScene(sceneId: string, name: string): void {
    this.send({ type: 'scene:rename', sceneId, name });
  }

  // Drawing methods
  sendDrawStroke(sceneId: string, stroke: DrawStroke): void {
    this.send({ type: 'draw:stroke', sceneId, stroke });
  }

  sendDrawChunk(sceneId: string, chunkKey: ChunkKey, data: string, version: number = 0): void {
    this.send({ type: 'draw:chunk', sceneId, chunkKey, data, version });
  }

  requestDrawingSync(sceneId: string): void {
    this.send({ type: 'draw:sync-request', sceneId });
  }

  clearDrawing(sceneId: string): void {
    this.send({ type: 'draw:clear', sceneId });
  }

  moveTokenToScene(tokenId: string, targetSceneId: string): void {
    this.send({ type: 'token:move-to-scene', tokenId, targetSceneId });
  }

  updateTokenDrag(tokenId: string, playerId: string, x: number, y: number): void {
    this.send({ type: 'token:drag:update', tokenId, playerId, x, y });
  }

  clearTokenDrag(tokenId: string, playerId: string): void {
    this.send({ type: 'token:drag:clear', tokenId, playerId });
  }
}

export const wsClient = new WebSocketClient();
