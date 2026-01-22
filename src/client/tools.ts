export type Tool = 'move' | 'line' | 'circle' | 'cone' | 'grid-align';

export interface ToolState {
  currentTool: Tool;
  isDragging: boolean;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export function createToolState(): ToolState {
  return {
    currentTool: 'move',
    isDragging: false,
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
  };
}

export function startDrag(state: ToolState, x: number, y: number): void {
  state.isDragging = true;
  state.startX = x;
  state.startY = y;
  state.endX = x;
  state.endY = y;
}

export function updateDrag(state: ToolState, x: number, y: number): void {
  if (state.isDragging) {
    state.endX = x;
    state.endY = y;
  }
}

export function endDrag(state: ToolState): { startX: number; startY: number; endX: number; endY: number } | null {
  if (!state.isDragging) return null;

  state.isDragging = false;
  return {
    startX: state.startX,
    startY: state.startY,
    endX: state.endX,
    endY: state.endY,
  };
}

export function setTool(state: ToolState, tool: Tool): void {
  state.currentTool = tool;
  state.isDragging = false;
}

export function getCurrentMeasurement(state: ToolState): {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  tool: Tool;
} | null {
  if (!state.isDragging) return null;

  return {
    startX: state.startX,
    startY: state.startY,
    endX: state.endX,
    endY: state.endY,
    tool: state.currentTool,
  };
}
