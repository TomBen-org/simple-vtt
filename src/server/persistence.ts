import * as fs from 'fs';
import * as path from 'path';
import { GameState, Scene, DEFAULT_MAP_SETTINGS, generateId, createDefaultGameState, ChunkKey, DrawingLayer, DrawLayerType } from '../shared/types';

const DATA_DIR = path.join(process.cwd(), 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const DRAWINGS_DIR = path.join(DATA_DIR, 'drawings');

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

// Drawing persistence functions
export function getDrawingsDir(sceneId: string, layer: DrawLayerType): string {
  const drawingsDir = path.join(DRAWINGS_DIR, sceneId, layer);
  if (!fs.existsSync(drawingsDir)) {
    fs.mkdirSync(drawingsDir, { recursive: true });
  }
  return drawingsDir;
}

export function saveChunk(sceneId: string, layer: DrawLayerType, chunkKey: ChunkKey, base64Data: string): void {
  const dir = getDrawingsDir(sceneId, layer);
  const filePath = path.join(dir, `${chunkKey}.png`);

  // Remove the data URL prefix if present
  const base64 = base64Data.replace(/^data:image\/png;base64,/, '');
  const buffer = Buffer.from(base64, 'base64');

  fs.writeFileSync(filePath, buffer);
}

export function loadChunk(sceneId: string, layer: DrawLayerType, chunkKey: ChunkKey): string | null {
  const dir = getDrawingsDir(sceneId, layer);
  const filePath = path.join(dir, `${chunkKey}.png`);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const buffer = fs.readFileSync(filePath);
    return `data:image/png;base64,${buffer.toString('base64')}`;
  } catch (error) {
    console.error(`Error loading chunk ${chunkKey} for scene ${sceneId}:`, error);
    return null;
  }
}

export function loadAllChunks(sceneId: string, layer: DrawLayerType): DrawingLayer {
  const dir = getDrawingsDir(sceneId, layer);
  const chunks: Record<ChunkKey, string> = {};

  if (!fs.existsSync(dir)) {
    return { chunks, version: 0 };
  }

  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (file.endsWith('.png')) {
        const chunkKey = file.replace('.png', '') as ChunkKey;
        const filePath = path.join(dir, file);
        const buffer = fs.readFileSync(filePath);
        chunks[chunkKey] = `data:image/png;base64,${buffer.toString('base64')}`;
      }
    }
  } catch (error) {
    console.error(`Error loading chunks for scene ${sceneId}/${layer}:`, error);
  }

  return { chunks, version: Date.now() };
}

export function clearSceneDrawing(sceneId: string, layers?: DrawLayerType[]): void {
  const layersToClean = layers || ['dm', 'player'] as DrawLayerType[];

  for (const layer of layersToClean) {
    const dir = path.join(DRAWINGS_DIR, sceneId, layer);

    if (!fs.existsSync(dir)) {
      continue;
    }

    try {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        fs.unlinkSync(path.join(dir, file));
      }
      fs.rmdirSync(dir);
    } catch (error) {
      console.error(`Error clearing drawing for scene ${sceneId}/${layer}:`, error);
    }
  }
}

export function deleteChunk(sceneId: string, layer: DrawLayerType, chunkKey: ChunkKey): void {
  const dir = getDrawingsDir(sceneId, layer);
  const filePath = path.join(dir, `${chunkKey}.png`);

  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (error) {
      console.error(`Error deleting chunk ${chunkKey} for scene ${sceneId}:`, error);
    }
  }
}

export interface GarbageCollectResult {
  deletedUploads: number;
  deletedDrawingDirs: number;
}

export function garbageCollect(state: GameState): GarbageCollectResult {
  const result: GarbageCollectResult = {
    deletedUploads: 0,
    deletedDrawingDirs: 0,
  };

  // Collect all referenced image URLs from all scenes
  const referencedImages = new Set<string>();
  const validSceneIds = new Set<string>();

  for (const scene of state.scenes) {
    validSceneIds.add(scene.id);

    // Add map background URL
    if (scene.map.backgroundUrl) {
      // Extract filename from URL (e.g., "uploads/abc.png" -> "abc.png")
      const filename = scene.map.backgroundUrl.replace(/^uploads\//, '');
      referencedImages.add(filename);
    }

    // Add token image URLs
    for (const token of scene.tokens) {
      const filename = token.imageUrl.replace(/^uploads\//, '');
      referencedImages.add(filename);
    }
  }

  // Clean up orphaned uploads
  const uploadsDir = path.join(DATA_DIR, 'uploads');
  if (fs.existsSync(uploadsDir)) {
    try {
      const files = fs.readdirSync(uploadsDir);
      for (const file of files) {
        if (!referencedImages.has(file)) {
          try {
            fs.unlinkSync(path.join(uploadsDir, file));
            result.deletedUploads++;
          } catch (error) {
            console.error(`Error deleting orphaned upload ${file}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('Error reading uploads directory:', error);
    }
  }

  // Clean up orphaned drawing directories
  if (fs.existsSync(DRAWINGS_DIR)) {
    try {
      const dirs = fs.readdirSync(DRAWINGS_DIR);
      for (const dir of dirs) {
        if (!validSceneIds.has(dir)) {
          const dirPath = path.join(DRAWINGS_DIR, dir);
          try {
            fs.rmSync(dirPath, { recursive: true, force: true });
            result.deletedDrawingDirs++;
          } catch (error) {
            console.error(`Error deleting orphaned drawing directory ${dir}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('Error reading drawings directory:', error);
    }
  }

  return result;
}

/**
 * Migrate old flat drawing directory structure to layer subdirectories.
 * Old format: data/drawings/{sceneId}/*.png
 * New format: data/drawings/{sceneId}/dm/*.png
 * Existing drawings are treated as DM layer content.
 */
export function migrateDrawingsToLayers(): void {
  if (!fs.existsSync(DRAWINGS_DIR)) {
    return;
  }

  try {
    const sceneDirs = fs.readdirSync(DRAWINGS_DIR);
    for (const sceneDir of sceneDirs) {
      const scenePath = path.join(DRAWINGS_DIR, sceneDir);
      if (!fs.statSync(scenePath).isDirectory()) continue;

      // Check if there are .png files directly in the scene directory (old format)
      const entries = fs.readdirSync(scenePath);
      const pngFiles = entries.filter(f => f.endsWith('.png'));

      if (pngFiles.length === 0) continue;

      // Move them into dm/ subdirectory
      const dmDir = path.join(scenePath, 'dm');
      if (!fs.existsSync(dmDir)) {
        fs.mkdirSync(dmDir, { recursive: true });
      }

      let migrated = 0;
      for (const pngFile of pngFiles) {
        const oldPath = path.join(scenePath, pngFile);
        const newPath = path.join(dmDir, pngFile);
        fs.renameSync(oldPath, newPath);
        migrated++;
      }

      if (migrated > 0) {
        console.log(`Migrated ${migrated} drawing chunks for scene ${sceneDir} to dm/ layer`);
      }
    }
  } catch (error) {
    console.error('Error during drawing migration:', error);
  }
}
