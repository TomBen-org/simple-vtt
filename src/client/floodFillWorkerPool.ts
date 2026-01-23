import { ChunkKey, CHUNK_SIZE } from '../shared/types.js';

interface FloodFillMessage {
  type: 'flood-fill';
  chunkDataArray: Array<{ key: string; pixelData: ArrayBuffer }>;
  localX: number;
  localY: number;
  fillColor: [number, number, number, number];
  gridWidth: number;
  gridHeight: number;
  chunkSize: number;
}

interface EncodeChunkMessage {
  type: 'encode-chunk';
  pixelData: ArrayBuffer;
  width: number;
  height: number;
  chunkKey: string;
}

interface FloodFillResult {
  type: 'flood-fill-result';
  modifiedChunks: Array<{ key: string; pixelData: ArrayBuffer }>;
}

interface EncodeChunkResult {
  type: 'encode-chunk-result';
  dataUrl: string;
  chunkKey: string;
}

type WorkerMessage = FloodFillMessage | EncodeChunkMessage;
type WorkerResult = FloodFillResult | EncodeChunkResult;

interface PendingTask {
  resolve: (result: WorkerResult) => void;
  reject: (error: Error) => void;
}

function getWorkerCode(): string {
  return `
    self.onmessage = function(e) {
      const msg = e.data;

      if (msg.type === 'flood-fill') {
        handleFloodFill(msg);
      } else if (msg.type === 'encode-chunk') {
        handleEncodeChunk(msg);
      }
    };

    function handleFloodFill(msg) {
      const { chunkDataArray, localX, localY, fillColor, gridWidth, gridHeight, chunkSize } = msg;

      // Create a unified pixel buffer for the entire 3x3 grid (much faster than chunk lookups)
      const totalPixels = gridWidth * gridHeight * 4;
      const pixels = new Uint8ClampedArray(totalPixels);

      // Parse chunk keys to get the grid origin
      const firstKey = chunkDataArray[0].key;
      const [firstChunkX, firstChunkY] = firstKey.split(',').map(Number);

      // Copy chunk data into unified buffer
      for (const { key, pixelData } of chunkDataArray) {
        const [cx, cy] = key.split(',').map(Number);
        const chunkData = new Uint8ClampedArray(pixelData);
        const offsetX = (cx - firstChunkX) * chunkSize;
        const offsetY = (cy - firstChunkY) * chunkSize;

        for (let ly = 0; ly < chunkSize; ly++) {
          const srcStart = ly * chunkSize * 4;
          const dstStart = ((offsetY + ly) * gridWidth + offsetX) * 4;
          pixels.set(chunkData.subarray(srcStart, srcStart + chunkSize * 4), dstStart);
        }
      }

      // Bitmap for tracking filled pixels (1 byte per pixel, much faster than Set<string>)
      const filled = new Uint8Array(gridWidth * gridHeight);

      // Helper functions using direct array access
      const getIdx = (x, y) => (y * gridWidth + x) * 4;
      const getBitmapIdx = (x, y) => y * gridWidth + x;

      const getPixelAt = (x, y) => {
        const i = getIdx(x, y);
        return [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]];
      };

      const setPixelAt = (x, y, r, g, b, a) => {
        const i = getIdx(x, y);
        pixels[i] = r;
        pixels[i + 1] = g;
        pixels[i + 2] = b;
        pixels[i + 3] = a;
      };

      const colorsMatchAt = (x, y, tr, tg, tb, ta) => {
        const i = getIdx(x, y);
        return pixels[i] === tr && pixels[i + 1] === tg && pixels[i + 2] === tb && pixels[i + 3] === ta;
      };

      // Get target color at click position
      if (localX < 0 || localX >= gridWidth || localY < 0 || localY >= gridHeight) {
        self.postMessage({ type: 'flood-fill-result', modifiedChunks: [] });
        return;
      }

      const [tr, tg, tb, ta] = getPixelAt(localX, localY);
      const [fr, fg, fb, fa] = fillColor;

      // Don't fill if clicking on the same color
      if (tr === fr && tg === fg && tb === fb && ta === fa) {
        self.postMessage({ type: 'flood-fill-result', modifiedChunks: [] });
        return;
      }

      // Scanline flood fill with bitmap tracking
      const queue = new Int32Array(gridWidth * gridHeight * 2); // x,y pairs
      let queueHead = 0;
      let queueTail = 0;

      queue[queueTail++] = localX;
      queue[queueTail++] = localY;

      while (queueHead < queueTail) {
        let x = queue[queueHead++];
        const y = queue[queueHead++];

        // Skip if already processed or out of bounds
        if (y < 0 || y >= gridHeight) continue;

        // Move to leftmost pixel of this scanline that matches target
        while (x > 0 && colorsMatchAt(x - 1, y, tr, tg, tb, ta)) x--;

        let spanAbove = false;
        let spanBelow = false;

        // Fill rightward
        while (x < gridWidth && colorsMatchAt(x, y, tr, tg, tb, ta)) {
          const bIdx = getBitmapIdx(x, y);
          if (filled[bIdx]) {
            x++;
            continue;
          }

          filled[bIdx] = 1;
          setPixelAt(x, y, fr, fg, fb, fa);

          // Check above
          if (y > 0) {
            const aboveMatch = colorsMatchAt(x, y - 1, tr, tg, tb, ta) && !filled[getBitmapIdx(x, y - 1)];
            if (aboveMatch && !spanAbove) {
              queue[queueTail++] = x;
              queue[queueTail++] = y - 1;
              spanAbove = true;
            } else if (!aboveMatch) {
              spanAbove = false;
            }
          }

          // Check below
          if (y < gridHeight - 1) {
            const belowMatch = colorsMatchAt(x, y + 1, tr, tg, tb, ta) && !filled[getBitmapIdx(x, y + 1)];
            if (belowMatch && !spanBelow) {
              queue[queueTail++] = x;
              queue[queueTail++] = y + 1;
              spanBelow = true;
            } else if (!belowMatch) {
              spanBelow = false;
            }
          }

          x++;
        }
      }

      // Expand by 3 pixels to cover antialiased edges
      // Use double-buffering with bitmaps for speed
      let current = filled;
      let next = new Uint8Array(gridWidth * gridHeight);

      for (let expansion = 0; expansion < 3; expansion++) {
        next.set(current);

        for (let y = 0; y < gridHeight; y++) {
          for (let x = 0; x < gridWidth; x++) {
            if (current[getBitmapIdx(x, y)]) {
              // Expand to 8 neighbors
              for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                  if (dx === 0 && dy === 0) continue;
                  const nx = x + dx, ny = y + dy;
                  if (nx >= 0 && nx < gridWidth && ny >= 0 && ny < gridHeight) {
                    const nIdx = getBitmapIdx(nx, ny);
                    if (!current[nIdx] && !next[nIdx]) {
                      next[nIdx] = 1;
                      setPixelAt(nx, ny, fr, fg, fb, fa);
                    }
                  }
                }
              }
            }
          }
        }

        // Swap buffers
        const tmp = current;
        current = next;
        next = tmp;
      }

      // Copy back to chunk buffers
      const modifiedChunks = [];
      for (const { key, pixelData } of chunkDataArray) {
        const [cx, cy] = key.split(',').map(Number);
        const chunkData = new Uint8ClampedArray(pixelData);
        const offsetX = (cx - firstChunkX) * chunkSize;
        const offsetY = (cy - firstChunkY) * chunkSize;

        for (let ly = 0; ly < chunkSize; ly++) {
          const srcStart = ((offsetY + ly) * gridWidth + offsetX) * 4;
          const dstStart = ly * chunkSize * 4;
          chunkData.set(pixels.subarray(srcStart, srcStart + chunkSize * 4), dstStart);
        }

        modifiedChunks.push({ key, pixelData: chunkData.buffer });
      }

      self.postMessage(
        { type: 'flood-fill-result', modifiedChunks },
        modifiedChunks.map(c => c.pixelData)
      );
    }

    function handleEncodeChunk(msg) {
      const { pixelData, width, height, chunkKey } = msg;

      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d');
      const imageData = new ImageData(new Uint8ClampedArray(pixelData), width, height);
      ctx.putImageData(imageData, 0, 0);

      canvas.convertToBlob({ type: 'image/png' }).then(function(blob) {
        const reader = new FileReader();
        reader.onloadend = function() {
          self.postMessage({ type: 'encode-chunk-result', dataUrl: reader.result, chunkKey: chunkKey });
        };
        reader.readAsDataURL(blob);
      });
    }
  `;
}

class FloodFillWorkerPool {
  private workers: Worker[] = [];
  private idleWorkers: Worker[] = [];
  private pendingTasks: Map<Worker, PendingTask> = new Map();
  private initialized = false;
  private poolSize: number;
  private blobUrl: string | null = null;

  constructor() {
    this.poolSize = navigator.hardwareConcurrency || 4;
  }

  private initialize(): void {
    if (this.initialized) return;

    const code = getWorkerCode();
    const blob = new Blob([code], { type: 'application/javascript' });
    this.blobUrl = URL.createObjectURL(blob);

    for (let i = 0; i < this.poolSize; i++) {
      const worker = new Worker(this.blobUrl);
      worker.onmessage = (e) => this.handleWorkerMessage(worker, e.data);
      worker.onerror = (e) => this.handleWorkerError(worker, e);
      this.workers.push(worker);
      this.idleWorkers.push(worker);
    }

    this.initialized = true;
  }

  private handleWorkerMessage(worker: Worker, result: WorkerResult): void {
    const task = this.pendingTasks.get(worker);
    if (task) {
      this.pendingTasks.delete(worker);
      this.idleWorkers.push(worker);
      task.resolve(result);
    }
  }

  private handleWorkerError(worker: Worker, error: ErrorEvent): void {
    const task = this.pendingTasks.get(worker);
    if (task) {
      this.pendingTasks.delete(worker);
      this.idleWorkers.push(worker);
      task.reject(new Error(error.message));
    }
  }

  private async getIdleWorker(): Promise<Worker> {
    this.initialize();

    if (this.idleWorkers.length > 0) {
      return this.idleWorkers.pop()!;
    }

    // Wait for a worker to become idle
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (this.idleWorkers.length > 0) {
          clearInterval(checkInterval);
          resolve(this.idleWorkers.pop()!);
        }
      }, 1);
    });
  }

  private dispatchTask(worker: Worker, message: WorkerMessage, transfer?: Transferable[]): Promise<WorkerResult> {
    return new Promise((resolve, reject) => {
      this.pendingTasks.set(worker, { resolve, reject });
      if (transfer) {
        worker.postMessage(message, transfer);
      } else {
        worker.postMessage(message);
      }
    });
  }

  async floodFill(
    chunks: Map<ChunkKey, { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; imageData: ImageData }>,
    localX: number,
    localY: number,
    fillColor: [number, number, number, number],
    gridWidth: number,
    gridHeight: number
  ): Promise<Map<ChunkKey, ImageData>> {
    this.initialize();

    const worker = await this.getIdleWorker();

    // Prepare chunk data for transfer
    const chunkDataArray: Array<{ key: string; pixelData: ArrayBuffer }> = [];
    const transferList: ArrayBuffer[] = [];

    for (const [key, chunk] of chunks) {
      // Copy the buffer since we're transferring ownership
      const pixelData = chunk.imageData.data.buffer.slice(0);
      chunkDataArray.push({ key, pixelData });
      transferList.push(pixelData);
    }

    const result = await this.dispatchTask(
      worker,
      {
        type: 'flood-fill',
        chunkDataArray,
        localX,
        localY,
        fillColor,
        gridWidth,
        gridHeight,
        chunkSize: CHUNK_SIZE
      },
      transferList
    ) as FloodFillResult;

    // Convert results back to ImageData
    const modifiedChunks = new Map<ChunkKey, ImageData>();
    for (const { key, pixelData } of result.modifiedChunks) {
      const imageData = new ImageData(
        new Uint8ClampedArray(pixelData),
        CHUNK_SIZE,
        CHUNK_SIZE
      );
      modifiedChunks.set(key as ChunkKey, imageData);
    }

    return modifiedChunks;
  }

  async encodeChunksParallel(
    chunks: Map<ChunkKey, { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; imageData: ImageData }>
  ): Promise<Map<ChunkKey, string>> {
    this.initialize();

    const chunkEntries = Array.from(chunks.entries());
    const results = new Map<ChunkKey, string>();

    // Process chunks in parallel batches
    const tasks: Array<{ chunkKey: ChunkKey; promise: Promise<WorkerResult> }> = [];

    for (const [chunkKey, chunk] of chunkEntries) {
      const worker = await this.getIdleWorker();

      // Copy the pixel data (we need to transfer it)
      const pixelData = chunk.imageData.data.buffer.slice(0);

      const promise = this.dispatchTask(
        worker,
        {
          type: 'encode-chunk',
          pixelData,
          width: CHUNK_SIZE,
          height: CHUNK_SIZE,
          chunkKey
        },
        [pixelData]  // Transfer the buffer
      );

      tasks.push({ chunkKey, promise });
    }

    // Wait for all encoding to complete
    const taskResults = await Promise.all(tasks.map(t => t.promise)) as EncodeChunkResult[];

    for (const result of taskResults) {
      results.set(result.chunkKey as ChunkKey, result.dataUrl);
    }

    return results;
  }

  terminate(): void {
    for (const worker of this.workers) {
      worker.terminate();
    }
    this.workers = [];
    this.idleWorkers = [];
    this.pendingTasks.clear();
    this.initialized = false;
  }
}

// Singleton instance with lazy initialization
export const workerPool = new FloodFillWorkerPool();
