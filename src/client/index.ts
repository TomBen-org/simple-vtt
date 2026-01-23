import { GameState, Token, Measurement, Scene, createDefaultGameState, DrawTool, DrawStroke, ChunkKey } from '../shared/types.js';
import { wsClient } from './websocket.js';
import { initCanvas, render, loadBackground, getCanvas, getContext, resizeCanvas, clearBackground, DragDropState } from './canvas.js';
import { createToolState, setTool, startDrag, updateDrag, endDrag, Tool, ToolState, getCurrentMeasurement } from './tools.js';
import { findTokenAtPoint, uploadImage, loadTokenImage } from './tokens.js';
import {
  initUI,
  setActiveTool,
  updateUIFromState,
  setOnToolChange,
  setOnMapUpload,
  setOnTokenUpload,
  setOnGridChange,
  setOnSnapChange,
  setOnSceneChange,
  setOnSceneCreate,
  setOnSceneDelete,
  setOnSceneRename,
  updateSceneSelector,
  setOnDrawModeChange,
  setOnDrawToolChange,
  setOnDrawColorChange,
  setOnDrawBrushSizeChange,
  setOnDrawClear,
  setDrawModeEnabled,
  setDrawColor,
  setOnDrawingOpacityChange,
} from './ui.js';
import { createViewState, ViewState, screenToWorld, startPan, updatePan, endPan, applyZoom } from './viewState.js';
import { getTokensInMeasurement } from './geometry.js';
import { DrawingLayer } from './drawing.js';

// UUID generator that uses crypto.randomUUID if available, falls back for insecure contexts (HTTP)
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

let gameState: GameState = createDefaultGameState();

function getActiveScene(): Scene | undefined {
  return gameState.scenes.find(s => s.id === gameState.activeSceneId);
}
let toolState: ToolState = createToolState();
let viewState: ViewState = createViewState();
let selectedTokenId: string | null = null;
let draggedToken: Token | null = null;
let dragOffsetX = 0;
let dragOffsetY = 0;

// Player ID for measurement sync
const playerId = generateUUID();

// Remote measurements from other players
const remoteMeasurements: Map<string, Measurement> = new Map();

// Highlighted tokens (touched by any measurement)
let highlightedTokenIds: Set<string> = new Set();

// Throttle measurement updates
let lastMeasurementUpdate = 0;
const MEASUREMENT_THROTTLE_MS = 50;

// Pan tracking
let isRightMouseDown = false;
let hasPanned = false;
const PAN_THRESHOLD = 3;

// Context menu
let contextMenuTokenId: string | null = null;

// Modifier key state for snap override
let ctrlKeyPressed = false;

// Client-side snap to grid setting (not synced)
let snapToGrid = true;

// Drag and drop state for file uploads
let dragDropState: DragDropState | null = null;

// Drawing layer
const drawingLayer = new DrawingLayer();
let drawModeEnabled = false;
let isDrawing = false;

// Client-side drawing opacity (not synced)
let drawingOpacity = 1.0;

// Valid image types for drag-and-drop
const VALID_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

function isValidImageFile(file: File): boolean {
  return VALID_IMAGE_TYPES.includes(file.type);
}

function calculateTokenPositions(dropX: number, dropY: number, count: number, gridSize: number): {x: number, y: number}[] {
  const positions: {x: number, y: number}[] = [];
  const cols = Math.min(count, 2); // Max 2 columns
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    positions.push({
      x: dropX + col * gridSize,
      y: dropY + row * gridSize
    });
  }
  return positions;
}

function init(): void {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  if (!canvas) {
    console.error('Canvas not found');
    return;
  }

  initCanvas(canvas);
  initUI();
  setupEventHandlers();
  setupCanvasEvents(canvas);
  setupContextMenu();
  setupDragAndDrop(canvas);

  // Set up drawing layer callbacks
  drawingLayer.onStrokeUpdate = (stroke: DrawStroke) => {
    const activeScene = getActiveScene();
    if (activeScene) {
      wsClient.sendDrawStroke(activeScene.id, stroke);
    }
  };

  drawingLayer.onChunkUpdate = (chunkKey: ChunkKey, data: string) => {
    const activeScene = getActiveScene();
    if (activeScene) {
      wsClient.sendDrawChunk(activeScene.id, chunkKey, data);
    }
  };

  wsClient.onMessage((message) => {
    switch (message.type) {
      case 'sync':
        gameState = message.state;
        const syncScene = getActiveScene();
        if (syncScene) {
          updateUIFromState(syncScene.map);
          if (syncScene.map.backgroundUrl) {
            loadBackground(syncScene.map.backgroundUrl);
          } else {
            clearBackground();
          }
          syncScene.tokens.forEach(token => loadTokenImage(token));
          // Request drawing layer sync
          wsClient.requestDrawingSync(syncScene.id);
        }
        updateSceneSelector(gameState.scenes, gameState.activeSceneId);
        break;

      case 'token:add':
        const addScene = getActiveScene();
        if (addScene) {
          addScene.tokens.push(message.token);
          loadTokenImage(message.token);
        }
        break;

      case 'token:move':
        const moveScene = getActiveScene();
        if (moveScene) {
          const token = moveScene.tokens.find(t => t.id === message.id);
          if (token) {
            token.x = message.x;
            token.y = message.y;
          }
        }
        break;

      case 'token:remove':
        const removeScene = getActiveScene();
        if (removeScene) {
          removeScene.tokens = removeScene.tokens.filter(t => t.id !== message.id);
          if (selectedTokenId === message.id) {
            selectedTokenId = null;
          }
        }
        break;

      case 'token:resize':
        const resizeScene = getActiveScene();
        if (resizeScene) {
          const resizedToken = resizeScene.tokens.find(t => t.id === message.id);
          if (resizedToken) {
            resizedToken.gridWidth = message.gridWidth;
            resizedToken.gridHeight = message.gridHeight;
          }
        }
        break;

      case 'map:set':
        const mapSetScene = getActiveScene();
        if (mapSetScene) {
          mapSetScene.map.backgroundUrl = message.backgroundUrl;
          loadBackground(message.backgroundUrl);
        }
        break;

      case 'map:grid':
        const gridScene = getActiveScene();
        if (gridScene) {
          gridScene.map.gridEnabled = message.enabled;
          if (message.size !== undefined) {
            gridScene.map.gridSize = message.size;
          }
          if (message.offsetX !== undefined) {
            gridScene.map.gridOffsetX = message.offsetX;
          }
          if (message.offsetY !== undefined) {
            gridScene.map.gridOffsetY = message.offsetY;
          }
          updateUIFromState(gridScene.map);
        }
        break;

      case 'measurement:update':
        // Only store measurements from other players
        if (message.measurement.playerId !== playerId) {
          remoteMeasurements.set(message.measurement.playerId, message.measurement);
        }
        break;

      case 'measurement:clear':
        // Only handle clears from other players
        if (message.playerId !== playerId) {
          remoteMeasurements.delete(message.playerId);
        }
        break;

      case 'scene:create':
        gameState.scenes.push(message.scene);
        updateSceneSelector(gameState.scenes, gameState.activeSceneId);
        break;

      case 'scene:delete':
        gameState.scenes = gameState.scenes.filter(s => s.id !== message.sceneId);
        updateSceneSelector(gameState.scenes, gameState.activeSceneId);
        break;

      case 'scene:switch':
        gameState.activeSceneId = message.sceneId;
        // Clear measurements on scene switch
        remoteMeasurements.clear();
        wsClient.clearMeasurement(playerId);
        // Clear and reload drawing layer
        drawingLayer.clear();
        wsClient.requestDrawingSync(message.sceneId);
        const switchedScene = getActiveScene();
        if (switchedScene) {
          if (switchedScene.map.backgroundUrl) {
            loadBackground(switchedScene.map.backgroundUrl);
          } else {
            clearBackground();
          }
          switchedScene.tokens.forEach(token => loadTokenImage(token));
          updateUIFromState(switchedScene.map);
        }
        updateSceneSelector(gameState.scenes, gameState.activeSceneId);
        selectedTokenId = null;
        draggedToken = null;
        break;

      case 'scene:rename':
        const renamedScene = gameState.scenes.find(s => s.id === message.sceneId);
        if (renamedScene) {
          renamedScene.name = message.name;
        }
        updateSceneSelector(gameState.scenes, gameState.activeSceneId);
        break;

      case 'draw:stroke':
        // Apply remote stroke for real-time preview
        if (message.sceneId === gameState.activeSceneId) {
          drawingLayer.applyRemoteStroke(message.stroke);
        }
        break;

      case 'draw:chunk':
        // Load updated chunk
        if (message.sceneId === gameState.activeSceneId) {
          drawingLayer.loadChunk(message.chunkKey, message.data);
        }
        break;

      case 'draw:sync':
        // Load all chunks for the scene
        if (message.sceneId === gameState.activeSceneId) {
          drawingLayer.loadAllChunks(message.chunks);
        }
        break;

      case 'draw:clear':
        // Clear drawing layer
        if (message.sceneId === gameState.activeSceneId) {
          drawingLayer.clear();
        }
        break;
    }
  });

  wsClient.connect();

  function renderLoop(): void {
    // Calculate highlighted tokens from all active measurements
    highlightedTokenIds = new Set<string>();

    const activeSceneForRender = getActiveScene();
    if (activeSceneForRender) {
      // Check local measurement
      const localMeasurement = getCurrentMeasurement(toolState);
      if (localMeasurement && localMeasurement.tool !== 'move' && localMeasurement.tool !== 'grid-align') {
        const measurement: Measurement = {
          id: 'local',
          playerId: playerId,
          tool: localMeasurement.tool as 'line' | 'circle' | 'cone',
          startX: localMeasurement.startX,
          startY: localMeasurement.startY,
          endX: localMeasurement.endX,
          endY: localMeasurement.endY,
        };
        const tokenIds = getTokensInMeasurement(measurement, activeSceneForRender.tokens, activeSceneForRender.map.gridSize);
        tokenIds.forEach((id) => highlightedTokenIds.add(id));
      }

      // Check remote measurements
      remoteMeasurements.forEach((measurement) => {
        const tokenIds = getTokensInMeasurement(measurement, activeSceneForRender.tokens, activeSceneForRender.map.gridSize);
        tokenIds.forEach((id) => highlightedTokenIds.add(id));
      });
    }

    render(gameState, toolState, selectedTokenId, viewState, remoteMeasurements, highlightedTokenIds, dragDropState, drawingLayer, drawingOpacity);
    requestAnimationFrame(renderLoop);
  }
  renderLoop();
}

function setupEventHandlers(): void {
  setOnToolChange((tool: Tool) => {
    setTool(toolState, tool);
    selectedTokenId = null;
  });

  setOnMapUpload(async (file: File) => {
    try {
      const url = await uploadImage(file);
      const choice = confirm('Create a new scene with this map?\n\nOK = New scene\nCancel = Replace current background');
      if (choice) {
        // Create new scene
        const name = prompt('Scene name:', `Scene ${gameState.scenes.length + 1}`);
        if (name) {
          wsClient.createScene(name, url);
        }
      } else {
        // Replace current background
        wsClient.setMapBackground(url);
      }
    } catch (error) {
      console.error('Failed to upload map:', error);
    }
  });

  setOnTokenUpload(async (file: File) => {
    try {
      const url = await uploadImage(file);
      const token: Token = {
        id: generateUUID(),
        x: 100,
        y: 100,
        gridWidth: 1,  // Default to 1x1 grid size
        gridHeight: 1,
        imageUrl: url,
        name: file.name.replace(/\.[^/.]+$/, ''),
      };
      wsClient.addToken(token);
    } catch (error) {
      console.error('Failed to upload token:', error);
    }
  });

  setOnGridChange((enabled: boolean, size: number, offsetX: number, offsetY: number) => {
    wsClient.setGrid(enabled, size, offsetX, offsetY);
  });

  setOnSnapChange((enabled: boolean) => {
    snapToGrid = enabled;
  });

  setOnSceneChange((sceneId: string) => {
    wsClient.switchScene(sceneId);
  });

  setOnSceneCreate((name: string) => {
    wsClient.createScene(name);
  });

  setOnSceneDelete((sceneId: string) => {
    wsClient.deleteScene(sceneId);
  });

  setOnSceneRename((sceneId: string, name: string) => {
    wsClient.renameScene(sceneId, name);
  });

  // Drawing handlers
  setOnDrawModeChange((enabled: boolean) => {
    drawModeEnabled = enabled;
    if (!enabled) {
      // Reset to move tool when exiting draw mode
      setTool(toolState, 'move');
      setActiveTool('move');
      // Hide cursor preview
      drawingLayer.updateCursor(0, 0, false);
    }
  });

  setOnDrawToolChange((tool: DrawTool) => {
    drawingLayer.setBrush({ tool });
  });

  setOnDrawColorChange((color: string) => {
    drawingLayer.setBrush({ color });
  });

  setOnDrawBrushSizeChange((size: number) => {
    drawingLayer.setBrush({ size });
  });

  setOnDrawClear(() => {
    const activeScene = getActiveScene();
    if (activeScene) {
      wsClient.clearDrawing(activeScene.id);
    }
  });

  setOnDrawingOpacityChange((opacity: number) => {
    drawingOpacity = opacity;
  });
}

function setupCanvasEvents(canvas: HTMLCanvasElement): void {
  canvas.addEventListener('mousedown', (e) => {
    // Hide context menu on any click
    hideContextMenu();

    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    // Right-click starts panning
    if (e.button === 2) {
      isRightMouseDown = true;
      hasPanned = false;
      startPan(viewState, screenX, screenY);
      return;
    }

    // Convert screen coordinates to world coordinates
    const world = screenToWorld(viewState, screenX, screenY);
    const x = world.x;
    const y = world.y;

    // Drawing mode handling
    if (drawModeEnabled) {
      const brush = drawingLayer.getBrush();
      if (brush.tool === 'fill') {
        // Flood fill on click (async, fire-and-forget)
        drawingLayer.floodFill(x, y).catch((err) => {
          console.error('Flood fill error:', err);
        });
      } else if (brush.tool === 'picker') {
        // Sample color from the canvas (merged view of background, drawings, tokens)
        const ctx = getContext();
        const pixelData = ctx.getImageData(screenX, screenY, 1, 1).data;
        const r = pixelData[0];
        const g = pixelData[1];
        const b = pixelData[2];
        const hexColor = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
        setDrawColor(hexColor);
        drawingLayer.setBrush({ color: hexColor });
      } else {
        // Start drawing stroke
        isDrawing = true;
        drawingLayer.beginStroke(x, y);
      }
      return;
    }

    if (toolState.currentTool === 'move') {
      const activeSceneMouseDown = getActiveScene();
      if (activeSceneMouseDown) {
        const token = findTokenAtPoint(x, y, activeSceneMouseDown.tokens, activeSceneMouseDown.map.gridSize);
        if (token) {
          selectedTokenId = token.id;
          draggedToken = token;
          dragOffsetX = x - token.x;
          dragOffsetY = y - token.y;
          const tokenWidth = token.gridWidth * activeSceneMouseDown.map.gridSize;
          const tokenHeight = token.gridHeight * activeSceneMouseDown.map.gridSize;
          startDrag(toolState, token.x + tokenWidth / 2, token.y + tokenHeight / 2);
        } else {
          selectedTokenId = null;
          draggedToken = null;
        }
      }
    } else {
      startDrag(toolState, x, y);
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    // Handle panning
    if (isRightMouseDown) {
      const dx = screenX - viewState.panStartX;
      const dy = screenY - viewState.panStartY;
      if (Math.abs(dx) > PAN_THRESHOLD || Math.abs(dy) > PAN_THRESHOLD) {
        hasPanned = true;
      }
      updatePan(viewState, screenX, screenY);
      return;
    }

    // Convert screen coordinates to world coordinates
    const world = screenToWorld(viewState, screenX, screenY);
    const x = world.x;
    const y = world.y;

    // Update drawing cursor position
    if (drawModeEnabled) {
      const brush = drawingLayer.getBrush();
      const showCursor = brush.tool === 'brush' || brush.tool === 'eraser';
      drawingLayer.updateCursor(x, y, showCursor);
    } else {
      drawingLayer.updateCursor(0, 0, false);
    }

    // Drawing mode handling
    if (drawModeEnabled && isDrawing) {
      drawingLayer.continueStroke(x, y);
      return;
    }

    if (toolState.isDragging) {
      if (toolState.currentTool === 'move' && draggedToken) {
        const activeSceneMouseMove = getActiveScene();
        if (activeSceneMouseMove) {
          const gridSize = activeSceneMouseMove.map.gridSize;
          const tokenWidth = draggedToken.gridWidth * gridSize;
          const tokenHeight = draggedToken.gridHeight * gridSize;

          let newX = x - dragOffsetX;
          let newY = y - dragOffsetY;

          // Snap to grid: Ctrl inverts the snap setting
          const shouldSnap = ctrlKeyPressed ? !snapToGrid : snapToGrid;
          if (shouldSnap) {
            const offsetX = activeSceneMouseMove.map.gridOffsetX || 0;
            const offsetY = activeSceneMouseMove.map.gridOffsetY || 0;
            newX = Math.round((newX - offsetX) / gridSize) * gridSize + offsetX;
            newY = Math.round((newY - offsetY) / gridSize) * gridSize + offsetY;
          }

          draggedToken.x = newX;
          draggedToken.y = newY;
          updateDrag(toolState, draggedToken.x + tokenWidth / 2, draggedToken.y + tokenHeight / 2);
        }
      } else {
        updateDrag(toolState, x, y);

        // Send measurement update to other players (throttled)
        if (toolState.currentTool !== 'move' && toolState.currentTool !== 'grid-align') {
          const now = Date.now();
          if (now - lastMeasurementUpdate >= MEASUREMENT_THROTTLE_MS) {
            lastMeasurementUpdate = now;
            const measurement: Measurement = {
              id: generateUUID(),
              playerId: playerId,
              tool: toolState.currentTool as 'line' | 'circle' | 'cone',
              startX: toolState.startX,
              startY: toolState.startY,
              endX: toolState.endX,
              endY: toolState.endY,
            };
            wsClient.updateMeasurement(measurement);
          }
        }
      }
    }
  });

  canvas.addEventListener('mouseup', (e) => {
    // Handle right-click release for panning
    if (e.button === 2) {
      isRightMouseDown = false;
      endPan(viewState);
      return;
    }

    // Drawing mode handling
    if (drawModeEnabled && isDrawing) {
      isDrawing = false;
      drawingLayer.endStroke();
      return;
    }

    if (toolState.currentTool === 'move' && draggedToken) {
      wsClient.moveToken(draggedToken.id, draggedToken.x, draggedToken.y);
      draggedToken = null;
    } else if (toolState.currentTool === 'grid-align' && toolState.isDragging) {
      // Grid alignment tool: set grid size and offset based on drawn box
      const width = Math.abs(toolState.endX - toolState.startX);
      const height = Math.abs(toolState.endY - toolState.startY);

      if (width > 10 && height > 10) {
        // Use the longest side for calculation (square grid)
        const longestSide = Math.max(width, height);
        const dimension = width >= height ? 'width' : 'height';

        // Ask user how many cells were selected
        const input = prompt(`How many grid cells did you select along the ${dimension}?`, '1');
        if (input !== null) {
          const cellCount = parseFloat(input);
          if (!isNaN(cellCount) && cellCount > 0) {
            // Calculate grid size from selection
            const newGridSize = longestSide / cellCount;

            // Use starting point for offset calculation
            const offsetX = toolState.startX % newGridSize;
            const offsetY = toolState.startY % newGridSize;

            const activeSceneMouseUp = getActiveScene();
            wsClient.setGrid(activeSceneMouseUp?.map.gridEnabled ?? true, newGridSize, offsetX, offsetY);
          }
        }
      }
    } else if (toolState.currentTool !== 'move' && toolState.currentTool !== 'grid-align' && toolState.isDragging) {
      // Clear measurement from other players' views
      wsClient.clearMeasurement(playerId);
    }
    endDrag(toolState);
  });

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();

    // Don't show context menu if we just panned
    if (hasPanned) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const world = screenToWorld(viewState, screenX, screenY);

    const activeSceneContext = getActiveScene();
    if (activeSceneContext) {
      const token = findTokenAtPoint(world.x, world.y, activeSceneContext.tokens, activeSceneContext.map.gridSize);
      if (token) {
        showContextMenu(e.clientX, e.clientY, token.id);
      } else {
        hideContextMenu();
      }
    }
  });

  // Zoom with scroll wheel
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;
    applyZoom(viewState, e.deltaY, cursorX, cursorY);
  }, { passive: false });

  // Hide drawing cursor when leaving canvas
  canvas.addEventListener('mouseleave', () => {
    drawingLayer.updateCursor(0, 0, false);
  });

  // Track Ctrl key for snap override
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Control') {
      ctrlKeyPressed = true;
    }
  });

  document.addEventListener('keyup', (e) => {
    if (e.key === 'Control') {
      ctrlKeyPressed = false;
    }
  });
}

function showContextMenu(x: number, y: number, tokenId: string): void {
  const menu = document.getElementById('context-menu');
  if (!menu) return;

  contextMenuTokenId = tokenId;

  // Position the menu
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.classList.remove('hidden');

  // Adjust if menu goes off screen
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    menu.style.left = `${x - rect.width}px`;
  }
  if (rect.bottom > window.innerHeight) {
    menu.style.top = `${y - rect.height}px`;
  }
}

function hideContextMenu(): void {
  const menu = document.getElementById('context-menu');
  if (menu) {
    menu.classList.add('hidden');
  }
  contextMenuTokenId = null;
}

function setupContextMenu(): void {
  const menu = document.getElementById('context-menu');
  if (!menu) return;

  // Handle menu item clicks
  menu.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (!target.matches('.context-menu-item')) return;

    const action = target.dataset.action;

    if (action === 'delete' && contextMenuTokenId) {
      wsClient.removeToken(contextMenuTokenId);
      hideContextMenu();
    } else if (action === 'resize' && contextMenuTokenId) {
      const size = parseInt(target.dataset.size || '1', 10);
      // Size is in grid units now (1, 2, 3, 4)
      wsClient.resizeToken(contextMenuTokenId, size, size);
      hideContextMenu();
    }
  });

  // Close menu when clicking elsewhere
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('context-menu');
    if (menu && !menu.contains(e.target as Node)) {
      hideContextMenu();
    }
  });

  // Close menu on escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideContextMenu();
    }
  });
}

function setupDragAndDrop(canvas: HTMLCanvasElement): void {
  // Prevent browser from loading dropped images anywhere on the page
  document.addEventListener('dragover', (e) => {
    e.preventDefault();
  });
  document.addEventListener('drop', (e) => {
    e.preventDefault();
  });

  canvas.addEventListener('dragenter', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  canvas.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Check if we have valid image files
    const items = e.dataTransfer?.items;
    if (!items) return;

    let validCount = 0;
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file' && VALID_IMAGE_TYPES.includes(items[i].type)) {
        validCount++;
      }
    }

    if (validCount > 0) {
      const rect = canvas.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const world = screenToWorld(viewState, screenX, screenY);

      dragDropState = {
        active: true,
        x: world.x,
        y: world.y,
        fileCount: validCount
      };
      e.dataTransfer.dropEffect = 'copy';
    } else {
      dragDropState = null;
      e.dataTransfer!.dropEffect = 'none';
    }
  });

  canvas.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Only clear if we're actually leaving the canvas (not entering a child element)
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
      dragDropState = null;
    }
  });

  canvas.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) {
      dragDropState = null;
      return;
    }

    // Filter to valid image files
    const validFiles: File[] = [];
    for (let i = 0; i < files.length; i++) {
      if (isValidImageFile(files[i])) {
        validFiles.push(files[i]);
      }
    }

    if (validFiles.length === 0) {
      dragDropState = null;
      return;
    }

    // Get drop position in world coordinates
    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const world = screenToWorld(viewState, screenX, screenY);

    // Calculate positions for each token
    const activeSceneDrop = getActiveScene();
    const gridSize = activeSceneDrop?.map.gridSize ?? 50;
    const positions = calculateTokenPositions(world.x, world.y, validFiles.length, gridSize);

    // Upload each file and create tokens
    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      const position = positions[i];

      try {
        const url = await uploadImage(file);
        const token: Token = {
          id: generateUUID(),
          x: position.x,
          y: position.y,
          gridWidth: 1,
          gridHeight: 1,
          imageUrl: url,
          name: file.name.replace(/\.[^/.]+$/, ''),
        };
        wsClient.addToken(token);
      } catch (error) {
        console.error('Failed to upload token:', error);
      }
    }

    dragDropState = null;
  });
}

document.addEventListener('DOMContentLoaded', init);
