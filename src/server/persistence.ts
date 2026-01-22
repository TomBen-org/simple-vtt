import * as fs from 'fs';
import * as path from 'path';
import { GameState, DEFAULT_GAME_STATE } from '../shared/types';

const DATA_DIR = path.join(process.cwd(), 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

export function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function loadState(): GameState {
  ensureDataDir();

  if (!fs.existsSync(STATE_FILE)) {
    return { ...DEFAULT_GAME_STATE, tokens: [], map: { ...DEFAULT_GAME_STATE.map } };
  }

  try {
    const data = fs.readFileSync(STATE_FILE, 'utf-8');
    const parsed = JSON.parse(data);

    // Migrate tokens from old format (width/height in pixels) to new format (gridWidth/gridHeight)
    const gridSize = parsed.map?.gridSize || DEFAULT_GAME_STATE.map.gridSize;
    const migratedTokens = (parsed.tokens || []).map((token: any) => {
      // If token already has gridWidth/gridHeight, use those
      if (token.gridWidth !== undefined && token.gridHeight !== undefined) {
        return token;
      }
      // Migrate from pixel dimensions to grid units
      const gridWidth = token.width ? Math.round(token.width / gridSize) || 1 : 1;
      const gridHeight = token.height ? Math.round(token.height / gridSize) || 1 : 1;
      return {
        id: token.id,
        x: token.x,
        y: token.y,
        imageUrl: token.imageUrl,
        gridWidth,
        gridHeight,
        name: token.name,
      };
    });

    return {
      tokens: migratedTokens,
      map: {
        ...DEFAULT_GAME_STATE.map,
        ...parsed.map,
        // Remove old pixelsPerFoot if present
        gridOffsetX: parsed.map?.gridOffsetX ?? 0,
        gridOffsetY: parsed.map?.gridOffsetY ?? 0,
        snapToGrid: parsed.map?.snapToGrid ?? true,
      },
    };
  } catch (error) {
    console.error('Error loading state:', error);
    return { ...DEFAULT_GAME_STATE, tokens: [], map: { ...DEFAULT_GAME_STATE.map } };
  }
}

export function saveState(state: GameState): void {
  ensureDataDir();

  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving state:', error);
  }
}

export function getUploadsDir(): string {
  const uploadsDir = path.join(DATA_DIR, 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  return uploadsDir;
}
