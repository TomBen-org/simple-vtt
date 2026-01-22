export interface Token {
  id: string;
  x: number;
  y: number;
  imageUrl: string;
  width: number;
  height: number;
  name?: string;
}

export interface MapSettings {
  backgroundUrl: string | null;
  pixelsPerFoot: number;
  gridEnabled: boolean;
  gridSize: number;
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
  | { type: 'token:resize'; id: string; width: number; height: number }
  | { type: 'map:set'; backgroundUrl: string }
  | { type: 'map:scale'; pixelsPerFoot: number }
  | { type: 'map:grid'; enabled: boolean; size?: number }
  | { type: 'measurement:update'; measurement: Measurement }
  | { type: 'measurement:clear'; playerId: string };

export const DEFAULT_MAP_SETTINGS: MapSettings = {
  backgroundUrl: null,
  pixelsPerFoot: 10,
  gridEnabled: true,
  gridSize: 50,
};

export const DEFAULT_GAME_STATE: GameState = {
  tokens: [],
  map: { ...DEFAULT_MAP_SETTINGS },
};
