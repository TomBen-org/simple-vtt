export interface Token {
  id: string;
  x: number;
  y: number;
  imageUrl: string;
  gridWidth: number;   // Size in grid cells (e.g., 1 for 1x1, 2 for 2x2)
  gridHeight: number;
  name?: string;
}

export interface MapSettings {
  backgroundUrl: string | null;
  gridEnabled: boolean;
  gridSize: number;
  gridOffsetX: number;  // Grid offset for alignment
  gridOffsetY: number;
  snapToGrid: boolean;  // Whether tokens snap to grid
}

export interface GameState {
  tokens: Token[];
  map: MapSettings;
}

export interface Measurement {
  id: string;
  playerId: string;
  tool: 'line' | 'circle' | 'cone';
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
  | { type: 'map:snap'; enabled: boolean }
  | { type: 'measurement:update'; measurement: Measurement }
  | { type: 'measurement:clear'; playerId: string };

export const DEFAULT_MAP_SETTINGS: MapSettings = {
  backgroundUrl: null,
  gridEnabled: true,
  gridSize: 50,
  gridOffsetX: 0,
  gridOffsetY: 0,
  snapToGrid: true,
};

export const DEFAULT_GAME_STATE: GameState = {
  tokens: [],
  map: { ...DEFAULT_MAP_SETTINGS },
};
