import { DrawTool, DrawStroke, ChunkKey, CHUNK_SIZE, worldToChunkKey, chunkKeyToWorld, getChunksInRect, generateId } from '../shared/types.js';
import { ViewState } from './viewState.js';
import { workerPool } from './floodFillWorkerPool.js';

export interface BrushSettings {
  tool: DrawTool;
  color: string;
  size: number;
}

export class DrawingLayer {
  private chunks: Map<ChunkKey, HTMLCanvasElement> = new Map();
  private scratchCanvas: HTMLCanvasElement;
  private scratchCtx: CanvasRenderingContext2D;
  private currentStroke: DrawStroke | null = null;
  private brushSettings: BrushSettings = {
    tool: 'brush',
    color: '#ff0000',
    size: 10,
  };

  // Cursor position for preview circle
  private cursorX: number = 0;
  private cursorY: number = 0;
  private showCursor: boolean = false;

  // Scratch canvas origin for proper positioning
  private scratchOriginX: number = 0;
  private scratchOriginY: number = 0;

  // Callbacks for WebSocket communication
  public onStrokeUpdate: ((stroke: DrawStroke) => void) | null = null;
  public onChunkUpdate: ((chunkKey: ChunkKey, data: string) => void) | null = null;

  constructor() {
    // Create scratch canvas for in-progress strokes
    this.scratchCanvas = document.createElement('canvas');
    this.scratchCanvas.width = 4096;
    this.scratchCanvas.height = 4096;
    const ctx = this.scratchCanvas.getContext('2d');
    if (!ctx) throw new Error('Failed to create scratch canvas context');
    this.scratchCtx = ctx;
    this.scratchCtx.imageSmoothingEnabled = false;
  }

  setBrush(settings: Partial<BrushSettings>): void {
    this.brushSettings = { ...this.brushSettings, ...settings };
  }

  getBrush(): BrushSettings {
    return { ...this.brushSettings };
  }

  updateCursor(worldX: number, worldY: number, show: boolean): void {
    this.cursorX = worldX;
    this.cursorY = worldY;
    this.showCursor = show;
  }

  private getOrCreateChunk(key: ChunkKey): HTMLCanvasElement {
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = document.createElement('canvas');
      chunk.width = CHUNK_SIZE;
      chunk.height = CHUNK_SIZE;
      const ctx = chunk.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = false;
      }
      this.chunks.set(key, chunk);
    }
    return chunk;
  }

  private getChunkContext(key: ChunkKey): CanvasRenderingContext2D | null {
    const chunk = this.getOrCreateChunk(key);
    return chunk.getContext('2d');
  }

  beginStroke(worldX: number, worldY: number): void {
    this.currentStroke = {
      id: generateId(),
      tool: this.brushSettings.tool,
      color: this.brushSettings.color,
      brushSize: this.brushSettings.size,
      points: [{ x: worldX, y: worldY }],
    };

    // Set scratch canvas origin to center around the starting point
    // This allows drawing in any world coordinate region
    this.scratchOriginX = worldX - this.scratchCanvas.width / 2;
    this.scratchOriginY = worldY - this.scratchCanvas.height / 2;

    // Clear scratch canvas
    this.scratchCtx.clearRect(0, 0, this.scratchCanvas.width, this.scratchCanvas.height);

    // For shape tools, we just record the start point
    if (this.brushSettings.tool === 'brush') {
      // Draw initial point to scratch canvas
      this.drawPointToScratch(worldX, worldY);
    } else if (this.brushSettings.tool === 'eraser') {
      // Eraser applies directly to chunks (can't preview on transparent scratch)
      this.applyEraserPoint(worldX, worldY);
    }

    // Notify listeners
    if (this.onStrokeUpdate && this.currentStroke) {
      this.onStrokeUpdate(this.currentStroke);
    }
  }

  continueStroke(worldX: number, worldY: number): void {
    if (!this.currentStroke) return;

    const lastPoint = this.currentStroke.points[this.currentStroke.points.length - 1];

    if (this.brushSettings.tool === 'brush') {
      // Draw line from last point to current point on scratch canvas
      this.drawLineToScratch(lastPoint.x, lastPoint.y, worldX, worldY);
      this.currentStroke.points.push({ x: worldX, y: worldY });
    } else if (this.brushSettings.tool === 'eraser') {
      // Eraser applies directly to chunks
      this.applyEraserLine(lastPoint.x, lastPoint.y, worldX, worldY);
      this.currentStroke.points.push({ x: worldX, y: worldY });
    } else {
      // For shape tools, update the end point
      if (this.currentStroke.points.length > 1) {
        this.currentStroke.points[1] = { x: worldX, y: worldY };
      } else {
        this.currentStroke.points.push({ x: worldX, y: worldY });
      }

      // Redraw shape preview on scratch canvas
      this.scratchCtx.clearRect(0, 0, this.scratchCanvas.width, this.scratchCanvas.height);
      this.drawShapeToScratch(this.currentStroke);
    }

    // Notify listeners
    if (this.onStrokeUpdate && this.currentStroke) {
      this.onStrokeUpdate(this.currentStroke);
    }
  }

  endStroke(): void {
    if (!this.currentStroke) return;

    // Apply the stroke to the actual chunks
    this.applyStrokeToChunks(this.currentStroke);

    // Clear scratch canvas
    this.scratchCtx.clearRect(0, 0, this.scratchCanvas.width, this.scratchCanvas.height);

    // Notify chunk updates
    this.notifyAffectedChunks(this.currentStroke);

    this.currentStroke = null;
  }

  private drawPointToScratch(x: number, y: number): void {
    const ctx = this.scratchCtx;
    const size = this.brushSettings.size;

    // Convert world coordinates to scratch canvas coordinates
    const localX = x - this.scratchOriginX;
    const localY = y - this.scratchOriginY;

    ctx.fillStyle = this.brushSettings.color;
    ctx.beginPath();
    ctx.arc(localX, localY, size / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawLineToScratch(x1: number, y1: number, x2: number, y2: number): void {
    const ctx = this.scratchCtx;
    const size = this.brushSettings.size;

    // Convert world coordinates to scratch canvas coordinates
    const localX1 = x1 - this.scratchOriginX;
    const localY1 = y1 - this.scratchOriginY;
    const localX2 = x2 - this.scratchOriginX;
    const localY2 = y2 - this.scratchOriginY;

    ctx.strokeStyle = this.brushSettings.color;
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(localX1, localY1);
    ctx.lineTo(localX2, localY2);
    ctx.stroke();
  }

  private applyEraserPoint(x: number, y: number): void {
    const size = this.brushSettings.size;
    const affectedChunks = getChunksInRect(x - size, y - size, x + size, y + size);

    for (const chunkKey of affectedChunks) {
      const ctx = this.getChunkContext(chunkKey);
      if (!ctx) continue;

      const chunkWorld = chunkKeyToWorld(chunkKey);

      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(x - chunkWorld.x, y - chunkWorld.y, size / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private applyEraserLine(x1: number, y1: number, x2: number, y2: number): void {
    const size = this.brushSettings.size;
    const minX = Math.min(x1, x2) - size;
    const minY = Math.min(y1, y2) - size;
    const maxX = Math.max(x1, x2) + size;
    const maxY = Math.max(y1, y2) + size;
    const affectedChunks = getChunksInRect(minX, minY, maxX, maxY);

    for (const chunkKey of affectedChunks) {
      const ctx = this.getChunkContext(chunkKey);
      if (!ctx) continue;

      const chunkWorld = chunkKeyToWorld(chunkKey);

      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x1 - chunkWorld.x, y1 - chunkWorld.y);
      ctx.lineTo(x2 - chunkWorld.x, y2 - chunkWorld.y);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawShapeToScratch(stroke: DrawStroke): void {
    if (stroke.points.length < 2) return;

    const ctx = this.scratchCtx;
    const start = stroke.points[0];
    const end = stroke.points[1];

    // Convert world coordinates to scratch canvas coordinates
    const startX = start.x - this.scratchOriginX;
    const startY = start.y - this.scratchOriginY;
    const endX = end.x - this.scratchOriginX;
    const endY = end.y - this.scratchOriginY;

    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
    ctx.lineWidth = stroke.brushSize;
    ctx.lineCap = 'round';

    switch (stroke.tool) {
      case 'line':
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        break;

      case 'rect':
        const rectX = Math.min(startX, endX);
        const rectY = Math.min(startY, endY);
        const rectW = Math.abs(endX - startX);
        const rectH = Math.abs(endY - startY);
        ctx.fillRect(rectX, rectY, rectW, rectH);
        break;

      case 'ellipse':
        const centerX = (startX + endX) / 2;
        const centerY = (startY + endY) / 2;
        const radiusX = Math.abs(endX - startX) / 2;
        const radiusY = Math.abs(endY - startY) / 2;
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
    }
  }

  private applyStrokeToChunks(stroke: DrawStroke): void {
    // Calculate bounding box of stroke
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const point of stroke.points) {
      minX = Math.min(minX, point.x - stroke.brushSize);
      minY = Math.min(minY, point.y - stroke.brushSize);
      maxX = Math.max(maxX, point.x + stroke.brushSize);
      maxY = Math.max(maxY, point.y + stroke.brushSize);
    }

    // Get affected chunks
    const affectedChunks = getChunksInRect(minX, minY, maxX, maxY);

    // Draw to each affected chunk
    for (const chunkKey of affectedChunks) {
      const ctx = this.getChunkContext(chunkKey);
      if (!ctx) continue;

      const chunkWorld = chunkKeyToWorld(chunkKey);

      ctx.save();
      ctx.translate(-chunkWorld.x, -chunkWorld.y);

      if (stroke.tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
      }

      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.color;
      ctx.lineWidth = stroke.brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (stroke.tool === 'brush' || stroke.tool === 'eraser') {
        // Draw the path
        if (stroke.points.length === 1) {
          ctx.beginPath();
          ctx.arc(stroke.points[0].x, stroke.points[0].y, stroke.brushSize / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
          for (let i = 1; i < stroke.points.length; i++) {
            ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
          }
          ctx.stroke();
        }
      } else if (stroke.points.length >= 2) {
        // Draw shape
        const start = stroke.points[0];
        const end = stroke.points[1];

        switch (stroke.tool) {
          case 'line':
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
            ctx.stroke();
            break;

          case 'rect':
            const rectX = Math.min(start.x, end.x);
            const rectY = Math.min(start.y, end.y);
            const rectW = Math.abs(end.x - start.x);
            const rectH = Math.abs(end.y - start.y);
            ctx.fillRect(rectX, rectY, rectW, rectH);
            break;

          case 'ellipse':
            const centerX = (start.x + end.x) / 2;
            const centerY = (start.y + end.y) / 2;
            const radiusX = Math.abs(end.x - start.x) / 2;
            const radiusY = Math.abs(end.y - start.y) / 2;
            ctx.beginPath();
            ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
            ctx.fill();
            break;
        }
      }

      ctx.restore();
    }
  }

  private notifyAffectedChunks(stroke: DrawStroke): void {
    if (!this.onChunkUpdate) return;

    // Calculate bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const point of stroke.points) {
      minX = Math.min(minX, point.x - stroke.brushSize);
      minY = Math.min(minY, point.y - stroke.brushSize);
      maxX = Math.max(maxX, point.x + stroke.brushSize);
      maxY = Math.max(maxY, point.y + stroke.brushSize);
    }

    const affectedChunks = getChunksInRect(minX, minY, maxX, maxY);

    for (const chunkKey of affectedChunks) {
      const chunk = this.chunks.get(chunkKey);
      if (chunk) {
        const data = chunk.toDataURL('image/png');
        this.onChunkUpdate(chunkKey, data);
      }
    }
  }

  applyRemoteStroke(stroke: DrawStroke): void {
    // Draw remote stroke directly to scratch canvas for preview
    // This will be cleared when the chunk data is received
    const ctx = this.scratchCtx;

    ctx.save();

    if (stroke.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
    }

    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
    ctx.lineWidth = stroke.brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (stroke.tool === 'brush' || stroke.tool === 'eraser') {
      if (stroke.points.length === 1) {
        ctx.beginPath();
        ctx.arc(stroke.points[0].x, stroke.points[0].y, stroke.brushSize / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
          ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        ctx.stroke();
      }
    } else if (stroke.points.length >= 2) {
      this.drawShapeToScratch(stroke);
    }

    ctx.restore();
  }

  loadChunk(chunkKey: ChunkKey, base64Data: string): void {
    const img = new Image();
    img.onload = () => {
      const chunk = this.getOrCreateChunk(chunkKey);
      const ctx = chunk.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, CHUNK_SIZE, CHUNK_SIZE);
        ctx.drawImage(img, 0, 0);
      }
    };
    img.src = base64Data;
  }

  loadAllChunks(chunks: Record<ChunkKey, string>): void {
    // Clear existing chunks
    this.chunks.clear();

    // Load new chunks
    for (const [key, data] of Object.entries(chunks)) {
      this.loadChunk(key as ChunkKey, data);
    }
  }

  getChunkData(chunkKey: ChunkKey): string | null {
    const chunk = this.chunks.get(chunkKey);
    if (!chunk) return null;
    return chunk.toDataURL('image/png');
  }

  clear(): void {
    this.chunks.clear();
    this.scratchCtx.clearRect(0, 0, this.scratchCanvas.width, this.scratchCanvas.height);
    this.currentStroke = null;
  }

  async floodFill(worldX: number, worldY: number): Promise<void> {
    const fillColor = this.hexToRgba(this.brushSettings.color);
    const startChunkKey = worldToChunkKey(worldX, worldY);
    const [startChunkX, startChunkY] = startChunkKey.split(',').map(Number);

    // Get the 9 chunks (3x3 grid centered on clicked chunk)
    const chunks: Map<ChunkKey, { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; imageData: ImageData }> = new Map();

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const key = `${startChunkX + dx},${startChunkY + dy}` as ChunkKey;
        const canvas = this.getOrCreateChunk(key);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          chunks.set(key, {
            canvas,
            ctx,
            imageData: ctx.getImageData(0, 0, CHUNK_SIZE, CHUNK_SIZE)
          });
        }
      }
    }

    // Calculate local coordinates within the multi-chunk grid
    const gridOriginX = (startChunkX - 1) * CHUNK_SIZE;
    const gridOriginY = (startChunkY - 1) * CHUNK_SIZE;
    const gridWidth = CHUNK_SIZE * 3;
    const gridHeight = CHUNK_SIZE * 3;

    const localX = Math.floor(worldX - gridOriginX);
    const localY = Math.floor(worldY - gridOriginY);

    // Perform flood fill in worker (entire algorithm runs off main thread)
    const modifiedChunks = await workerPool.floodFill(
      chunks,
      localX,
      localY,
      fillColor,
      gridWidth,
      gridHeight
    );

    // If no chunks were modified (e.g., clicked on same color), we're done
    if (modifiedChunks.size === 0) return;

    // Apply modified ImageData back to chunk canvases and notify
    for (const [key, imageData] of modifiedChunks) {
      const chunk = chunks.get(key);
      if (chunk) {
        chunk.ctx.putImageData(imageData, 0, 0);
        // Encode from canvas and notify (like original code)
        if (this.onChunkUpdate) {
          const dataUrl = chunk.canvas.toDataURL('image/png');
          this.onChunkUpdate(key, dataUrl);
        }
      }
    }
  }

  private getPixel(imageData: ImageData, x: number, y: number): [number, number, number, number] {
    const i = (y * imageData.width + x) * 4;
    return [
      imageData.data[i],
      imageData.data[i + 1],
      imageData.data[i + 2],
      imageData.data[i + 3],
    ];
  }

  private setPixel(imageData: ImageData, x: number, y: number, color: [number, number, number, number]): void {
    const i = (y * imageData.width + x) * 4;
    imageData.data[i] = color[0];
    imageData.data[i + 1] = color[1];
    imageData.data[i + 2] = color[2];
    imageData.data[i + 3] = color[3];
  }

  private colorsMatch(a: [number, number, number, number], b: [number, number, number, number]): boolean {
    return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
  }

  private hexToRgba(hex: string): [number, number, number, number] {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (result) {
      return [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16),
        255,
      ];
    }
    return [255, 0, 0, 255]; // Default to red
  }

  render(ctx: CanvasRenderingContext2D, viewState: ViewState): void {
    // Calculate visible bounds in world coordinates
    const canvas = ctx.canvas;
    const worldLeft = -viewState.panX / viewState.zoom;
    const worldTop = -viewState.panY / viewState.zoom;
    const worldRight = (canvas.width - viewState.panX) / viewState.zoom;
    const worldBottom = (canvas.height - viewState.panY) / viewState.zoom;

    // Get visible chunks
    const visibleChunks = getChunksInRect(worldLeft, worldTop, worldRight, worldBottom);

    // Draw visible chunks
    for (const chunkKey of visibleChunks) {
      const chunk = this.chunks.get(chunkKey);
      if (chunk) {
        const chunkWorld = chunkKeyToWorld(chunkKey);
        ctx.drawImage(chunk, chunkWorld.x, chunkWorld.y);
      }
    }

    // Draw scratch canvas (in-progress strokes, but not for eraser)
    if (this.currentStroke && this.currentStroke.tool !== 'eraser') {
      ctx.drawImage(this.scratchCanvas, this.scratchOriginX, this.scratchOriginY);
    }

    // Draw cursor preview circle for brush/eraser
    if (this.showCursor && (this.brushSettings.tool === 'brush' || this.brushSettings.tool === 'eraser')) {
      ctx.save();
      ctx.strokeStyle = this.brushSettings.tool === 'eraser' ? '#ffffff' : this.brushSettings.color;
      ctx.lineWidth = 2 / viewState.zoom;
      ctx.setLineDash([4 / viewState.zoom, 4 / viewState.zoom]);
      ctx.beginPath();
      ctx.arc(this.cursorX, this.cursorY, this.brushSettings.size / 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  hasCurrentStroke(): boolean {
    return this.currentStroke !== null;
  }
}
