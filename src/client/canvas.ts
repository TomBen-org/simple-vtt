import { GameState, Token, MapSettings, Measurement } from '../shared/types.js';
import { getTokenImage, getTokenMipmap, loadTokenImage } from './tokens.js';
import { ToolState, getCurrentMeasurement } from './tools.js';
import { ViewState } from './viewState.js';
import { generateMipmaps, selectMipmap } from './mipmaps.js';
import { DrawingLayer } from './drawing.js';

// Drag and drop state for rendering preview
export interface DragDropState {
  active: boolean;
  x: number;
  y: number;
  fileCount: number;
}

let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let backgroundMipmaps: HTMLCanvasElement[] | null = null;

export function initCanvas(canvasElement: HTMLCanvasElement): void {
  canvas = canvasElement;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Failed to get 2D context');
  }
  ctx = context;
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
}

export function resizeCanvas(): void {
  const isMobile = document.body.classList.contains('mobile-mode');
  const isLandscape = window.matchMedia('(orientation: landscape)').matches;

  if (isMobile && isLandscape) {
    // Landscape mobile: toolbar on left side (70px)
    canvas.width = window.innerWidth - 70;
    canvas.height = window.innerHeight;
  } else if (isMobile) {
    // Portrait mobile: toolbar on top (70px)
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight - 70;
  } else {
    // Desktop: toolbar on top (60px)
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight - 60;
  }
}

export function getCanvas(): HTMLCanvasElement {
  return canvas;
}

export function getContext(): CanvasRenderingContext2D {
  return ctx;
}

export function loadBackground(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      backgroundMipmaps = generateMipmaps(img);
      resolve();
    };
    img.onerror = reject;
    img.src = url;
  });
}

export function clearBackground(): void {
  backgroundMipmaps = null;
}

export function render(
  state: GameState,
  toolState: ToolState,
  selectedTokenId: string | null,
  viewState: ViewState,
  remoteMeasurements: Map<string, Measurement> = new Map(),
  highlightedTokenIds: Set<string> = new Set(),
  dragDropState: DragDropState | null = null,
  drawingLayer: DrawingLayer | null = null,
  drawingOpacity: number = 1
): void {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Get active scene
  const activeScene = state.scenes.find(s => s.id === state.activeSceneId);
  if (!activeScene) return;

  const map = activeScene.map;
  const tokens = activeScene.tokens;

  // Apply view transform
  ctx.save();
  ctx.translate(viewState.panX, viewState.panY);
  ctx.scale(viewState.zoom, viewState.zoom);

  if (backgroundMipmaps) {
    const originalWidth = backgroundMipmaps[0].width;
    const originalHeight = backgroundMipmaps[0].height;
    const targetWidth = originalWidth * viewState.zoom;
    const targetHeight = originalHeight * viewState.zoom;
    const mipmap = selectMipmap(backgroundMipmaps, targetWidth, targetHeight);
    ctx.drawImage(mipmap, 0, 0, originalWidth, originalHeight);
  }

  // Render drawing layer (above background, below grid)
  if (drawingLayer) {
    drawingLayer.render(ctx, viewState, drawingOpacity);
  }

  if (map.gridEnabled) {
    drawGrid(map, viewState);
  }

  tokens.forEach(token => {
    drawToken(token, token.id === selectedTokenId, highlightedTokenIds.has(token.id), map.gridSize, viewState);
  });

  // Draw local measurement
  drawMeasurement(map, toolState, viewState);

  // Draw remote measurements
  remoteMeasurements.forEach((measurement) => {
    drawRemoteMeasurement(map, measurement, viewState);
  });

  // Draw drag and drop preview
  if (dragDropState && dragDropState.active) {
    drawDragDropPreview(dragDropState, map.gridSize);
  }

  ctx.restore();
}

function drawGrid(map: MapSettings, viewState: ViewState): void {
  const gridSize = map.gridSize;
  const offsetX = map.gridOffsetX || 0;
  const offsetY = map.gridOffsetY || 0;

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 1 / viewState.zoom; // Keep line width consistent at different zoom levels

  // Calculate visible bounds in world coordinates
  const worldLeft = -viewState.panX / viewState.zoom;
  const worldTop = -viewState.panY / viewState.zoom;
  const worldRight = (canvas.width - viewState.panX) / viewState.zoom;
  const worldBottom = (canvas.height - viewState.panY) / viewState.zoom;

  // Calculate grid line start/end positions (aligned to grid with offset)
  const startX = Math.floor((worldLeft - offsetX) / gridSize) * gridSize + offsetX;
  const endX = Math.ceil((worldRight - offsetX) / gridSize) * gridSize + offsetX;
  const startY = Math.floor((worldTop - offsetY) / gridSize) * gridSize + offsetY;
  const endY = Math.ceil((worldBottom - offsetY) / gridSize) * gridSize + offsetY;

  // Draw vertical lines
  for (let x = startX; x <= endX; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, startY);
    ctx.lineTo(x, endY);
    ctx.stroke();
  }

  // Draw horizontal lines
  for (let y = startY; y <= endY; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(startX, y);
    ctx.lineTo(endX, y);
    ctx.stroke();
  }
}

function drawToken(token: Token, selected: boolean, highlighted: boolean, gridSize: number, viewState: ViewState): void {
  // Calculate pixel dimensions from grid units
  const width = token.gridWidth * gridSize;
  const height = token.gridHeight * gridSize;

  // Calculate target pixel size accounting for zoom
  const pixelWidth = width * viewState.zoom;
  const pixelHeight = height * viewState.zoom;

  // Get the appropriate mipmap for this zoom level
  const mipmap = getTokenMipmap(token.imageUrl, pixelWidth, pixelHeight);

  // Draw highlight glow if token is touched by measurement
  if (highlighted) {
    ctx.save();
    ctx.shadowColor = '#ff8c00';
    ctx.shadowBlur = 20;
    ctx.fillStyle = 'rgba(255, 140, 0, 0.3)';
    ctx.fillRect(token.x - 4, token.y - 4, width + 8, height + 8);
    ctx.restore();
  }

  if (mipmap) {
    ctx.drawImage(mipmap, token.x, token.y, width, height);
  } else {
    ctx.fillStyle = '#666';
    ctx.fillRect(token.x, token.y, width, height);
    loadTokenImage(token);
  }

  if (selected) {
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 3;
    ctx.strokeRect(token.x - 2, token.y - 2, width + 4, height + 4);
  }

  // Draw orange border for highlighted tokens
  if (highlighted && !selected) {
    ctx.strokeStyle = '#ff8c00';
    ctx.lineWidth = 3;
    ctx.strokeRect(token.x - 2, token.y - 2, width + 4, height + 4);
  }
}

function drawMeasurement(map: MapSettings, toolState: ToolState, viewState: ViewState): void {
  const measurement = getCurrentMeasurement(toolState);
  if (!measurement) return;

  const { startX, startY, endX, endY, tool } = measurement;
  const gridSize = map.gridSize;
  const feetPerCell = 5; // 1 grid cell = 5 feet
  const zoom = viewState.zoom;

  // Scale factors for constant screen-space size
  const lineWidth = 2 / zoom;
  const dashSize = 5 / zoom;

  ctx.save();

  if (tool === 'move' || tool === 'line') {
    ctx.strokeStyle = tool === 'move' ? '#00ff00' : '#ffff00';
    ctx.lineWidth = lineWidth;
    ctx.setLineDash([dashSize, dashSize]);
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    const distance = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
    const feet = (distance / gridSize) * feetPerCell;
    drawDistanceLabel(endX, endY - 10 / zoom, feet, undefined, zoom);
  } else if (tool === 'circle') {
    const radius = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
    ctx.strokeStyle = 'rgba(0, 150, 255, 0.8)';
    ctx.fillStyle = 'rgba(0, 150, 255, 0.2)';
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.arc(startX, startY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const feet = (radius / gridSize) * feetPerCell;
    drawDistanceLabel(startX, startY, feet, 'radius', zoom);
  } else if (tool === 'cone') {
    const dx = endX - startX;
    const dy = endY - startY;
    const angle = Math.atan2(dy, dx);
    const length = Math.sqrt(dx * dx + dy * dy);
    const coneAngle = Math.PI / 3;

    ctx.strokeStyle = 'rgba(255, 100, 0, 0.8)';
    ctx.fillStyle = 'rgba(255, 100, 0, 0.2)';
    ctx.lineWidth = lineWidth;

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.arc(startX, startY, length, angle - coneAngle / 2, angle + coneAngle / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    const feet = (length / gridSize) * feetPerCell;
    drawDistanceLabel(endX, endY, feet, 'length', zoom);
  } else if (tool === 'grid-align') {
    // Draw grid alignment preview box
    const minX = Math.min(startX, endX);
    const minY = Math.min(startY, endY);
    const width = Math.abs(endX - startX);
    const height = Math.abs(endY - startY);

    ctx.strokeStyle = 'rgba(0, 255, 128, 0.8)';
    ctx.fillStyle = 'rgba(0, 255, 128, 0.2)';
    ctx.lineWidth = lineWidth;
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.rect(minX, minY, width, height);
    ctx.fill();
    ctx.stroke();

    // Show size label with dimensions (constant screen size)
    const fontSize = 14 / zoom;
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.fillStyle = 'white';
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 3 / zoom;
    const text = `${Math.round(width)} × ${Math.round(height)} px`;
    ctx.strokeText(text, minX + 5 / zoom, minY + 20 / zoom);
    ctx.fillText(text, minX + 5 / zoom, minY + 20 / zoom);
  }

  ctx.restore();
}

function drawDistanceLabel(x: number, y: number, feet: number, label: string | undefined, zoom: number): void {
  const text = label ? `${feet.toFixed(1)} ft ${label}` : `${feet.toFixed(1)} ft`;
  const fontSize = 14 / zoom;
  ctx.font = `bold ${fontSize}px Arial`;
  ctx.fillStyle = 'white';
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 3 / zoom;
  ctx.strokeText(text, x + 5 / zoom, y);
  ctx.fillText(text, x + 5 / zoom, y);
}

function drawRemoteMeasurement(map: MapSettings, measurement: Measurement, viewState: ViewState): void {
  const { startX, startY, endX, endY, tool } = measurement;
  const gridSize = map.gridSize;
  const feetPerCell = 5; // 1 grid cell = 5 feet
  const zoom = viewState.zoom;

  // Scale factors for constant screen-space size
  const lineWidth = 2 / zoom;
  const dashSize = 5 / zoom;

  ctx.save();

  if (tool === 'line') {
    // Purple for remote line measurements
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = lineWidth;
    ctx.setLineDash([dashSize, dashSize]);
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    const distance = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
    const feet = (distance / gridSize) * feetPerCell;
    drawRemoteDistanceLabel(endX, endY - 10 / zoom, feet, undefined, zoom);
  } else if (tool === 'circle') {
    const radius = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
    // Purple for remote circle measurements
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.8)';
    ctx.fillStyle = 'rgba(168, 85, 247, 0.2)';
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.arc(startX, startY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const feet = (radius / gridSize) * feetPerCell;
    drawRemoteDistanceLabel(startX, startY, feet, 'radius', zoom);
  } else if (tool === 'cone') {
    const dx = endX - startX;
    const dy = endY - startY;
    const angle = Math.atan2(dy, dx);
    const length = Math.sqrt(dx * dx + dy * dy);
    const coneAngle = Math.PI / 3;

    // Purple for remote cone measurements
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.8)';
    ctx.fillStyle = 'rgba(168, 85, 247, 0.2)';
    ctx.lineWidth = lineWidth;

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.arc(startX, startY, length, angle - coneAngle / 2, angle + coneAngle / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    const feet = (length / gridSize) * feetPerCell;
    drawRemoteDistanceLabel(endX, endY, feet, 'length', zoom);
  }

  ctx.restore();
}

function drawRemoteDistanceLabel(x: number, y: number, feet: number, label: string | undefined, zoom: number): void {
  const text = label ? `${feet.toFixed(1)} ft ${label}` : `${feet.toFixed(1)} ft`;
  const fontSize = 14 / zoom;
  ctx.font = `bold ${fontSize}px Arial`;
  ctx.fillStyle = '#a855f7';
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 3 / zoom;
  ctx.strokeText(text, x + 5 / zoom, y);
  ctx.fillText(text, x + 5 / zoom, y);
}

function drawDragDropPreview(dragDropState: DragDropState, gridSize: number): void {
  const { x, y, fileCount } = dragDropState;
  const radius = gridSize / 2;

  // Calculate positions for multiple files (same as token placement)
  const cols = Math.min(fileCount, 2);
  const positions: { x: number; y: number }[] = [];
  for (let i = 0; i < fileCount; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    positions.push({
      x: x + col * gridSize + radius,
      y: y + row * gridSize + radius
    });
  }

  ctx.save();

  // Draw a circle for each file position
  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];

    // Draw semi-transparent circle
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(100, 200, 100, 0.3)';
    ctx.fill();
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw upload icon (arrow pointing up) - only on the first circle if multiple
    if (i === 0) {
      drawUploadIcon(pos.x, pos.y, radius * 0.5);
    }
  }

  // Draw file count indicator if multiple files
  if (fileCount > 1) {
    const firstPos = positions[0];
    ctx.font = 'bold 14px Arial';
    ctx.fillStyle = '#4ade80';
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 3;
    const countText = `×${fileCount}`;
    ctx.strokeText(countText, firstPos.x + radius + 5, firstPos.y - radius + 10);
    ctx.fillText(countText, firstPos.x + radius + 5, firstPos.y - radius + 10);
  }

  ctx.restore();
}

function drawUploadIcon(cx: number, cy: number, size: number): void {
  ctx.save();
  ctx.strokeStyle = '#4ade80';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Arrow shaft
  ctx.beginPath();
  ctx.moveTo(cx, cy + size * 0.5);
  ctx.lineTo(cx, cy - size * 0.3);
  ctx.stroke();

  // Arrow head
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.4, cy - size * 0.0);
  ctx.lineTo(cx, cy - size * 0.5);
  ctx.lineTo(cx + size * 0.4, cy - size * 0.0);
  ctx.stroke();

  // Base line (platform)
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.5, cy + size * 0.5);
  ctx.lineTo(cx + size * 0.5, cy + size * 0.5);
  ctx.stroke();

  ctx.restore();
}
