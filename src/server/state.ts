import { GameState, Token, MapSettings, DEFAULT_GAME_STATE } from '../shared/types';
import { loadState, saveState } from './persistence';

class StateManager {
  private state: GameState;

  constructor() {
    this.state = loadState();
    console.log('Loaded state with', this.state.tokens.length, 'tokens');
  }

  getState(): GameState {
    return this.state;
  }

  addToken(token: Token): void {
    this.state.tokens.push(token);
    this.persist();
  }

  moveToken(id: string, x: number, y: number): boolean {
    const token = this.state.tokens.find(t => t.id === id);
    if (token) {
      token.x = x;
      token.y = y;
      this.persist();
      return true;
    }
    return false;
  }

  removeToken(id: string): boolean {
    const index = this.state.tokens.findIndex(t => t.id === id);
    if (index !== -1) {
      this.state.tokens.splice(index, 1);
      this.persist();
      return true;
    }
    return false;
  }

  setMapBackground(backgroundUrl: string): void {
    this.state.map.backgroundUrl = backgroundUrl;
    this.persist();
  }

  setMapScale(pixelsPerFoot: number): void {
    this.state.map.pixelsPerFoot = pixelsPerFoot;
    this.persist();
  }

  setGridSettings(enabled: boolean, size?: number): void {
    this.state.map.gridEnabled = enabled;
    if (size !== undefined) {
      this.state.map.gridSize = size;
    }
    this.persist();
  }

  private persist(): void {
    saveState(this.state);
  }
}

export const stateManager = new StateManager();
