export interface Token {
  id: string;
  x: number;
  y: number;
  imageUrl: string;
  gridWidth: number;   // Size in grid cells (e.g., 1 for 1x1, 2 for 2x2)
  gridHeight: number;
  name?: string;
}

// Drawing layer types
export type DrawLayerType = 'dm' | 'player';
export const CHUNK_SIZE = 512;
export type ChunkKey = string;  // e.g., "0,0", "-1,2"

export type DrawTool = 'brush' | 'rect' | 'ellipse' | 'line' | 'fill' | 'picker';

export interface DrawStroke {
  id: string;
  tool: DrawTool;
  color: string;
  brushSize: number;
  points: { x: number; y: number }[];
  eraseMode?: boolean;  // When true, shape tools erase instead of draw
  // For shape tools (rect, ellipse, line), points[0] is start, points[1] is end
}

export interface DrawingLayer {
  chunks: Record<ChunkKey, string>;  // base64 PNG
  version: number;
}

// Helper functions for chunk coordinates
export function worldToChunkKey(x: number, y: number): ChunkKey {
  const chunkX = Math.floor(x / CHUNK_SIZE);
  const chunkY = Math.floor(y / CHUNK_SIZE);
  return `${chunkX},${chunkY}`;
}

export function chunkKeyToWorld(key: ChunkKey): { x: number; y: number } {
  const [chunkX, chunkY] = key.split(',').map(Number);
  return { x: chunkX * CHUNK_SIZE, y: chunkY * CHUNK_SIZE };
}

export function getChunksInRect(x1: number, y1: number, x2: number, y2: number): ChunkKey[] {
  const minX = Math.floor(Math.min(x1, x2) / CHUNK_SIZE);
  const maxX = Math.floor(Math.max(x1, x2) / CHUNK_SIZE);
  const minY = Math.floor(Math.min(y1, y2) / CHUNK_SIZE);
  const maxY = Math.floor(Math.max(y1, y2) / CHUNK_SIZE);

  const keys: ChunkKey[] = [];
  for (let cx = minX; cx <= maxX; cx++) {
    for (let cy = minY; cy <= maxY; cy++) {
      keys.push(`${cx},${cy}`);
    }
  }
  return keys;
}

export interface MapSettings {
  backgroundUrl: string | null;
  gridEnabled: boolean;
  gridSize: number;
  gridOffsetX: number;  // Grid offset for alignment
  gridOffsetY: number;
}

export interface Scene {
  id: string;
  name: string;
  tokens: Token[];
  map: MapSettings;
  drawing?: DrawingLayer;
}

export interface GameState {
  scenes: Scene[];
  activeSceneId: string;
}

export interface Measurement {
  id: string;
  playerId: string;
  tool: 'line' | 'circle' | 'cone' | 'cube';
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export type WSMessage =
  | { type: 'sync'; state: GameState }
  | { type: 'token:add'; token: Token }
  | { type: 'token:move'; id: string; x: number; y: number }
  | { type: 'token:remove'; id: string }
  | { type: 'token:resize'; id: string; gridWidth: number; gridHeight: number }
  | { type: 'map:set'; backgroundUrl: string }
  | { type: 'map:grid'; enabled: boolean; size?: number; offsetX?: number; offsetY?: number }
  | { type: 'measurement:update'; measurement: Measurement }
  | { type: 'measurement:clear'; playerId: string }
  | { type: 'scene:create'; scene: Scene }
  | { type: 'scene:delete'; sceneId: string }
  | { type: 'scene:switch'; sceneId: string }
  | { type: 'scene:rename'; sceneId: string; name: string }
  | { type: 'draw:stroke'; sceneId: string; layer: DrawLayerType; stroke: DrawStroke }
  | { type: 'draw:chunk'; sceneId: string; layer: DrawLayerType; chunkKey: ChunkKey; data: string; version: number }
  | { type: 'draw:sync-request'; sceneId: string }
  | { type: 'draw:sync'; sceneId: string; dmChunks: Record<ChunkKey, string>; playerChunks: Record<ChunkKey, string>; dmVersion: number; playerVersion: number }
  | { type: 'draw:clear'; sceneId: string; layers: DrawLayerType[] }
  | { type: 'token:move-to-scene'; tokenId: string; targetSceneId: string }
  | { type: 'token:drag:update'; tokenId: string; playerId: string; x: number; y: number; startX: number; startY: number }
  | { type: 'token:drag:clear'; tokenId: string; playerId: string };

export const DEFAULT_MAP_SETTINGS: MapSettings = {
  backgroundUrl: null,
  gridEnabled: true,
  gridSize: 50,
  gridOffsetX: 0,
  gridOffsetY: 0,
};

export function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

export function createDefaultScene(name: string = 'Scene 1'): Scene {
  return {
    id: generateId(),
    name,
    tokens: [],
    map: { ...DEFAULT_MAP_SETTINGS },
  };
}

export function createDefaultGameState(): GameState {
  const defaultScene = createDefaultScene();
  return {
    scenes: [defaultScene],
    activeSceneId: defaultScene.id,
  };
}

export const DEFAULT_GAME_STATE: GameState = createDefaultGameState();
