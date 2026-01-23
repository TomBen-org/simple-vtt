import { GameState, Token, Scene, DEFAULT_MAP_SETTINGS, generateId, ChunkKey, DrawingLayer } from '../shared/types';
import { loadState, saveState, saveChunk, loadAllChunks, clearSceneDrawing, deleteChunk } from './persistence';

class StateManager {
  private state: GameState;

  constructor() {
    this.state = loadState();
    const activeScene = this.getActiveScene();
    console.log('Loaded state with', this.state.scenes.length, 'scenes,', activeScene?.tokens.length ?? 0, 'tokens in active scene');
  }

  getState(): GameState {
    return this.state;
  }

  getActiveScene(): Scene | undefined {
    return this.state.scenes.find(s => s.id === this.state.activeSceneId);
  }

  // Scene management methods
  createScene(name: string, backgroundUrl?: string): Scene {
    const scene: Scene = {
      id: generateId(),
      name,
      tokens: [],
      map: {
        ...DEFAULT_MAP_SETTINGS,
        backgroundUrl: backgroundUrl || null,
      },
    };
    this.state.scenes.push(scene);
    this.persist();
    return scene;
  }

  deleteScene(sceneId: string): boolean {
    // Cannot delete the last scene
    if (this.state.scenes.length <= 1) {
      return false;
    }

    const index = this.state.scenes.findIndex(s => s.id === sceneId);
    if (index === -1) {
      return false;
    }

    this.state.scenes.splice(index, 1);

    // If we deleted the active scene, switch to first available
    if (this.state.activeSceneId === sceneId) {
      this.state.activeSceneId = this.state.scenes[0].id;
    }

    this.persist();
    return true;
  }

  switchScene(sceneId: string): boolean {
    const scene = this.state.scenes.find(s => s.id === sceneId);
    if (!scene) {
      return false;
    }
    this.state.activeSceneId = sceneId;
    this.persist();
    return true;
  }

  renameScene(sceneId: string, name: string): boolean {
    const scene = this.state.scenes.find(s => s.id === sceneId);
    if (!scene) {
      return false;
    }
    scene.name = name;
    this.persist();
    return true;
  }

  // Token methods (operate on active scene)
  addToken(token: Token): void {
    const scene = this.getActiveScene();
    if (scene) {
      scene.tokens.push(token);
      this.persist();
    }
  }

  moveToken(id: string, x: number, y: number): boolean {
    const scene = this.getActiveScene();
    if (!scene) return false;

    const token = scene.tokens.find(t => t.id === id);
    if (token) {
      token.x = x;
      token.y = y;
      this.persist();
      return true;
    }
    return false;
  }

  removeToken(id: string): boolean {
    const scene = this.getActiveScene();
    if (!scene) return false;

    const index = scene.tokens.findIndex(t => t.id === id);
    if (index !== -1) {
      scene.tokens.splice(index, 1);
      this.persist();
      return true;
    }
    return false;
  }

  resizeToken(id: string, gridWidth: number, gridHeight: number): boolean {
    const scene = this.getActiveScene();
    if (!scene) return false;

    const token = scene.tokens.find(t => t.id === id);
    if (token) {
      token.gridWidth = gridWidth;
      token.gridHeight = gridHeight;
      this.persist();
      return true;
    }
    return false;
  }

  moveTokenToScene(tokenId: string, targetSceneId: string): boolean {
    const sourceScene = this.getActiveScene();
    if (!sourceScene) return false;

    const targetScene = this.state.scenes.find(s => s.id === targetSceneId);
    if (!targetScene) return false;

    const tokenIndex = sourceScene.tokens.findIndex(t => t.id === tokenId);
    if (tokenIndex === -1) return false;

    // Remove token from source scene and add to target scene
    const [token] = sourceScene.tokens.splice(tokenIndex, 1);
    targetScene.tokens.push(token);

    this.persist();
    return true;
  }

  // Map methods (operate on active scene)
  setMapBackground(backgroundUrl: string): void {
    const scene = this.getActiveScene();
    if (scene) {
      scene.map.backgroundUrl = backgroundUrl;
      this.persist();
    }
  }

  setGridSettings(enabled: boolean, size?: number, offsetX?: number, offsetY?: number): void {
    const scene = this.getActiveScene();
    if (!scene) return;

    scene.map.gridEnabled = enabled;
    if (size !== undefined) {
      scene.map.gridSize = size;
    }
    if (offsetX !== undefined) {
      scene.map.gridOffsetX = offsetX;
    }
    if (offsetY !== undefined) {
      scene.map.gridOffsetY = offsetY;
    }
    this.persist();
  }

  // Drawing layer methods
  updateDrawingChunk(sceneId: string, chunkKey: ChunkKey, data: string): number {
    const scene = this.state.scenes.find(s => s.id === sceneId);
    if (!scene) return 0;

    // Initialize drawing layer if needed
    if (!scene.drawing) {
      scene.drawing = { chunks: {}, version: 0 };
    }

    // Update chunk in memory
    scene.drawing.chunks[chunkKey] = data;
    scene.drawing.version = Date.now();

    // Save to disk
    saveChunk(sceneId, chunkKey, data);

    return scene.drawing.version;
  }

  deleteDrawingChunk(sceneId: string, chunkKey: ChunkKey): number {
    const scene = this.state.scenes.find(s => s.id === sceneId);
    if (!scene || !scene.drawing) return 0;

    // Remove chunk from memory
    delete scene.drawing.chunks[chunkKey];
    scene.drawing.version = Date.now();

    // Delete from disk
    deleteChunk(sceneId, chunkKey);

    return scene.drawing.version;
  }

  getDrawingLayer(sceneId: string): DrawingLayer {
    const scene = this.state.scenes.find(s => s.id === sceneId);

    // Always load from disk - PNG files are the source of truth
    // (state.json chunks may be stale after server restart)
    const loaded = loadAllChunks(sceneId);
    if (scene) {
      scene.drawing = loaded;
    }
    return loaded;
  }

  clearDrawingLayer(sceneId: string): void {
    const scene = this.state.scenes.find(s => s.id === sceneId);
    if (scene) {
      scene.drawing = { chunks: {}, version: Date.now() };
    }
    clearSceneDrawing(sceneId);
  }

  private persist(): void {
    saveState(this.state);
  }
}

export const stateManager = new StateManager();
