import * as fs from 'fs';
import * as path from 'path';
import { GameState, Scene, DEFAULT_MAP_SETTINGS, generateId, createDefaultGameState } from '../shared/types';

const DATA_DIR = path.join(process.cwd(), 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

export function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function migrateTokens(tokens: any[], gridSize: number): any[] {
  return (tokens || []).map((token: any) => {
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
}

function migrateState(parsed: any): GameState {
  // If already has scenes array, return as-is (already migrated)
  if (parsed.scenes && Array.isArray(parsed.scenes)) {
    return parsed as GameState;
  }

  // Migrate from old single-scene format
  const gridSize = parsed.map?.gridSize || DEFAULT_MAP_SETTINGS.gridSize;
  const migratedTokens = migrateTokens(parsed.tokens, gridSize);

  const defaultScene: Scene = {
    id: generateId(),
    name: 'Scene 1',
    tokens: migratedTokens,
    map: {
      ...DEFAULT_MAP_SETTINGS,
      ...parsed.map,
      gridOffsetX: parsed.map?.gridOffsetX ?? 0,
      gridOffsetY: parsed.map?.gridOffsetY ?? 0,
    },
  };

  return {
    scenes: [defaultScene],
    activeSceneId: defaultScene.id,
  };
}

export function loadState(): GameState {
  ensureDataDir();

  if (!fs.existsSync(STATE_FILE)) {
    return createDefaultGameState();
  }

  try {
    const data = fs.readFileSync(STATE_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    return migrateState(parsed);
  } catch (error) {
    console.error('Error loading state:', error);
    return createDefaultGameState();
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
