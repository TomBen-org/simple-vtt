export interface ViewState {
  panX: number;      // Pan offset in screen pixels
  panY: number;
  zoom: number;      // Zoom level (1.0 = 100%)
  isPanning: boolean;
  panStartX: number;
  panStartY: number;
  panStartPanX: number;
  panStartPanY: number;
}

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 5.0;
export const ZOOM_FACTOR = 0.001;

export function createViewState(): ViewState {
  return {
    panX: 0,
    panY: 0,
    zoom: 1.0,
    isPanning: false,
    panStartX: 0,
    panStartY: 0,
    panStartPanX: 0,
    panStartPanY: 0,
  };
}

export function screenToWorld(viewState: ViewState, screenX: number, screenY: number): { x: number; y: number } {
  return {
    x: (screenX - viewState.panX) / viewState.zoom,
    y: (screenY - viewState.panY) / viewState.zoom,
  };
}

export function worldToScreen(viewState: ViewState, worldX: number, worldY: number): { x: number; y: number } {
  return {
    x: worldX * viewState.zoom + viewState.panX,
    y: worldY * viewState.zoom + viewState.panY,
  };
}

export function startPan(viewState: ViewState, screenX: number, screenY: number): void {
  viewState.isPanning = true;
  viewState.panStartX = screenX;
  viewState.panStartY = screenY;
  viewState.panStartPanX = viewState.panX;
  viewState.panStartPanY = viewState.panY;
}

export function updatePan(viewState: ViewState, screenX: number, screenY: number): void {
  if (!viewState.isPanning) return;
  viewState.panX = viewState.panStartPanX + (screenX - viewState.panStartX);
  viewState.panY = viewState.panStartPanY + (screenY - viewState.panStartY);
}

export function endPan(viewState: ViewState): void {
  viewState.isPanning = false;
}

export function applyZoom(viewState: ViewState, delta: number, cursorX: number, cursorY: number): void {
  const oldZoom = viewState.zoom;

  // Calculate new zoom level
  const zoomDelta = -delta * ZOOM_FACTOR;
  let newZoom = viewState.zoom * (1 + zoomDelta);
  newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));

  if (newZoom === oldZoom) return;

  // Convert cursor position to world coordinates before zoom
  const worldX = (cursorX - viewState.panX) / oldZoom;
  const worldY = (cursorY - viewState.panY) / oldZoom;

  // Apply new zoom
  viewState.zoom = newZoom;

  // Adjust pan so that the world point under cursor stays in place
  viewState.panX = cursorX - worldX * newZoom;
  viewState.panY = cursorY - worldY * newZoom;
}
