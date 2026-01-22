import { WSMessage, GameState, Token, Measurement, Scene, DEFAULT_MAP_SETTINGS } from '../shared/types.js';

type MessageHandler = (message: WSMessage) => void;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private handlers: MessageHandler[] = [];
  private reconnectTimeout: number | null = null;

  connect(): void {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WSMessage;
        this.handlers.forEach(handler => handler(message));
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected, reconnecting...');
      this.reconnectTimeout = window.setTimeout(() => this.connect(), 2000);
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
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
}

export const wsClient = new WebSocketClient();
