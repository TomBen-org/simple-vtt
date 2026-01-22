import { GameState, Token, MapSettings, Measurement } from '../shared/types.js';
import { getTokenImage, loadTokenImage } from './tokens.js';
import { ToolState, getCurrentMeasurement } from './tools.js';
import { ViewState } from './viewState.js';

let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let backgroundImage: HTMLImageElement | null = null;

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
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight - 60;
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
      backgroundImage = img;
      resolve();
    };
    img.onerror = reject;
    img.src = url;
  });
}

export function render(
  state: GameState,
  toolState: ToolState,
  selectedTokenId: string | null,
  viewState: ViewState,
  remoteMeasurements: Map<string, Measurement> = new Map(),
  highlightedTokenIds: Set<string> = new Set()
): void {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Apply view transform
  ctx.save();
  ctx.translate(viewState.panX, viewState.panY);
  ctx.scale(viewState.zoom, viewState.zoom);

  if (backgroundImage) {
    ctx.drawImage(backgroundImage, 0, 0);
  }

  if (state.map.gridEnabled) {
    drawGrid(state.map, viewState);
  }

  state.tokens.forEach(token => {
    drawToken(token, token.id === selectedTokenId, highlightedTokenIds.has(token.id));
  });

  // Draw local measurement
  drawMeasurement(state.map, toolState);

  // Draw remote measurements
  remoteMeasurements.forEach((measurement) => {
    drawRemoteMeasurement(state.map, measurement);
  });

  ctx.restore();
}

function drawGrid(map: MapSettings, viewState: ViewState): void {
  const gridSize = map.gridSize;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 1 / viewState.zoom; // Keep line width consistent at different zoom levels

  // Calculate visible bounds in world coordinates
  const worldLeft = -viewState.panX / viewState.zoom;
  const worldTop = -viewState.panY / viewState.zoom;
  const worldRight = (canvas.width - viewState.panX) / viewState.zoom;
  const worldBottom = (canvas.height - viewState.panY) / viewState.zoom;

  // Calculate grid line start/end positions (aligned to grid)
  const startX = Math.floor(worldLeft / gridSize) * gridSize;
  const endX = Math.ceil(worldRight / gridSize) * gridSize;
  const startY = Math.floor(worldTop / gridSize) * gridSize;
  const endY = Math.ceil(worldBottom / gridSize) * gridSize;

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

function drawToken(token: Token, selected: boolean, highlighted: boolean): void {
  const img = getTokenImage(token.imageUrl);

  // Draw highlight glow if token is touched by measurement
  if (highlighted) {
    ctx.save();
    ctx.shadowColor = '#ff8c00';
    ctx.shadowBlur = 20;
    ctx.fillStyle = 'rgba(255, 140, 0, 0.3)';
    ctx.fillRect(token.x - 4, token.y - 4, token.width + 8, token.height + 8);
    ctx.restore();
  }

  if (img) {
    ctx.drawImage(img, token.x, token.y, token.width, token.height);
  } else {
    ctx.fillStyle = '#666';
    ctx.fillRect(token.x, token.y, token.width, token.height);
    loadTokenImage(token);
  }

  if (selected) {
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 3;
    ctx.strokeRect(token.x - 2, token.y - 2, token.width + 4, token.height + 4);
  }

  // Draw orange border for highlighted tokens
  if (highlighted && !selected) {
    ctx.strokeStyle = '#ff8c00';
    ctx.lineWidth = 3;
    ctx.strokeRect(token.x - 2, token.y - 2, token.width + 4, token.height + 4);
  }
}

function drawMeasurement(map: MapSettings, toolState: ToolState): void {
  const measurement = getCurrentMeasurement(toolState);
  if (!measurement) return;

  const { startX, startY, endX, endY, tool } = measurement;
  const pixelsPerFoot = map.pixelsPerFoot;

  ctx.save();

  if (tool === 'select' || tool === 'line') {
    ctx.strokeStyle = tool === 'select' ? '#00ff00' : '#ffff00';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    const distance = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
    const feet = distance / pixelsPerFoot;
    drawDistanceLabel(endX, endY - 10, feet);
  } else if (tool === 'circle') {
    const radius = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
    ctx.strokeStyle = 'rgba(0, 150, 255, 0.8)';
    ctx.fillStyle = 'rgba(0, 150, 255, 0.2)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(startX, startY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const feet = radius / pixelsPerFoot;
    drawDistanceLabel(startX, startY, feet, 'radius');
  } else if (tool === 'cone') {
    const dx = endX - startX;
    const dy = endY - startY;
    const angle = Math.atan2(dy, dx);
    const length = Math.sqrt(dx * dx + dy * dy);
    const coneAngle = Math.PI / 3;

    ctx.strokeStyle = 'rgba(255, 100, 0, 0.8)';
    ctx.fillStyle = 'rgba(255, 100, 0, 0.2)';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.arc(startX, startY, length, angle - coneAngle / 2, angle + coneAngle / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    const feet = length / pixelsPerFoot;
    drawDistanceLabel(endX, endY, feet, 'length');
  }

  ctx.restore();
}

function drawDistanceLabel(x: number, y: number, feet: number, label?: string): void {
  const text = label ? `${feet.toFixed(1)} ft ${label}` : `${feet.toFixed(1)} ft`;
  ctx.font = 'bold 14px Arial';
  ctx.fillStyle = 'white';
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 3;
  ctx.strokeText(text, x + 5, y);
  ctx.fillText(text, x + 5, y);
}

function drawRemoteMeasurement(map: MapSettings, measurement: Measurement): void {
  const { startX, startY, endX, endY, tool } = measurement;
  const pixelsPerFoot = map.pixelsPerFoot;

  ctx.save();

  if (tool === 'line') {
    // Purple for remote line measurements
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    const distance = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
    const feet = distance / pixelsPerFoot;
    drawRemoteDistanceLabel(endX, endY - 10, feet);
  } else if (tool === 'circle') {
    const radius = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
    // Purple for remote circle measurements
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.8)';
    ctx.fillStyle = 'rgba(168, 85, 247, 0.2)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(startX, startY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const feet = radius / pixelsPerFoot;
    drawRemoteDistanceLabel(startX, startY, feet, 'radius');
  } else if (tool === 'cone') {
    const dx = endX - startX;
    const dy = endY - startY;
    const angle = Math.atan2(dy, dx);
    const length = Math.sqrt(dx * dx + dy * dy);
    const coneAngle = Math.PI / 3;

    // Purple for remote cone measurements
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.8)';
    ctx.fillStyle = 'rgba(168, 85, 247, 0.2)';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.arc(startX, startY, length, angle - coneAngle / 2, angle + coneAngle / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    const feet = length / pixelsPerFoot;
    drawRemoteDistanceLabel(endX, endY, feet, 'length');
  }

  ctx.restore();
}

function drawRemoteDistanceLabel(x: number, y: number, feet: number, label?: string): void {
  const text = label ? `${feet.toFixed(1)} ft ${label}` : `${feet.toFixed(1)} ft`;
  ctx.font = 'bold 14px Arial';
  ctx.fillStyle = '#a855f7';
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 3;
  ctx.strokeText(text, x + 5, y);
  ctx.fillText(text, x + 5, y);
}
