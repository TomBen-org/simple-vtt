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
    const parsed = JSON.parse(data) as GameState;
    return {
      tokens: parsed.tokens || [],
      map: {
        ...DEFAULT_GAME_STATE.map,
        ...parsed.map,
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
