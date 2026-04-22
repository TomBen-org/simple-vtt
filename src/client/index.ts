import { GameState, Token, Measurement, Scene, createDefaultGameState, DrawTool, DrawStroke, ChunkKey, DrawLayerType, InitiativeZone } from '../shared/types.js';
import { wsClient } from './websocket.js';
import { initCanvas, render, loadBackground, getCanvas, getContext, resizeCanvas, clearBackground, setBackgroundReady, DragDropState, RemoteTokenDrag } from './canvas.js';
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
  setOnEraseModeChange,
  setOnDmModeToggle,
  setMobileMode,
  getIsMobileMode,
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

// Remote token drag previews (keyed by playerId)
const remoteTokenDrags: Map<string, RemoteTokenDrag> = new Map();

// Throttle token drag updates
let lastTokenDragUpdate = 0;
const TOKEN_DRAG_THROTTLE_MS = 50;

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

// Drawing layers (DM and Player)
const dmDrawingLayer = new DrawingLayer();
const playerDrawingLayer = new DrawingLayer();
let drawModeEnabled = false;
let isDrawing = false;
let lastToolBeforeDrawMode: Tool = 'move';

function isDmMode(): boolean {
  return document.getElementById('toolbar')?.classList.contains('dm-mode') ?? false;
}
function getActiveDrawingLayer(): DrawingLayer {
  return isDmMode() ? dmDrawingLayer : playerDrawingLayer;
}
function getActiveLayerType(): DrawLayerType {
  return isDmMode() ? 'dm' : 'player';
}

// Snap a measurement point to half-grid intervals (grid intersections and cell centers)
function snapMeasurementPoint(pos: number, gridSize: number, offset: number): number {
  const halfGrid = gridSize / 2;
  return Math.round((pos - offset) / halfGrid) * halfGrid + offset;
}

// Client-side drawing opacity (not synced)
let drawingOpacity = 1.0;

// Valid image types for drag-and-drop
const VALID_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

// Initiative tracker state
let initiativeCollapsed = localStorage.getItem('simple-vtt-initiative-collapsed') === 'true';
let initiativeDragTokenId: string | null = null;
let initiativeDragGhostEl: HTMLImageElement | null = null;
let initiativePlaceholder: HTMLDivElement | null = null;
let initiativeDropZoneId: string | null = null;
let initiativeDropIndex = -1;
let initiativeZoneDragId: string | null = null;
let initiativeZoneDragGhostEl: HTMLDivElement | null = null;
let initiativeZonePlaceholder: HTMLDivElement | null = null;
let initiativeZoneDropIndex = -1;

// Touch handling state
const activePointers = new Map<number, { x: number; y: number }>();
let lastPinchDistance = 0;

// Long press handling
let longPressTimer: number | null = null;
let longPressTriggered = false;
const LONG_PRESS_DURATION = 500; // ms

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
  setupInitiativeTracker();

  // Initial mobile mode detection
  if (window.matchMedia('(pointer: coarse)').matches) {
    setMobileMode(true);
    setTool(toolState, 'pan-zoom');
  }

  // Fullscreen button handler
  setupFullscreenButton();

  // Set up drawing layer callbacks
  dmDrawingLayer.onStrokeUpdate = (stroke: DrawStroke) => {
    const activeScene = getActiveScene();
    if (activeScene) {
      wsClient.sendDrawStroke(activeScene.id, 'dm', stroke);
    }
  };
  dmDrawingLayer.onChunkUpdate = (chunkKey: ChunkKey, data: string) => {
    const activeScene = getActiveScene();
    if (activeScene) {
      wsClient.sendDrawChunk(activeScene.id, 'dm', chunkKey, data);
    }
  };
  playerDrawingLayer.onStrokeUpdate = (stroke: DrawStroke) => {
    const activeScene = getActiveScene();
    if (activeScene) {
      wsClient.sendDrawStroke(activeScene.id, 'player', stroke);
    }
  };
  playerDrawingLayer.onChunkUpdate = (chunkKey: ChunkKey, data: string) => {
    const activeScene = getActiveScene();
    if (activeScene) {
      wsClient.sendDrawChunk(activeScene.id, 'player', chunkKey, data);
    }
  };

  wsClient.onMessage((message) => {
    switch (message.type) {
      case 'sync':
        gameState = message.state;
        setBackgroundReady(false);
        // Clear ephemeral local state — any in-progress interactions are lost on reconnect
        selectedTokenId = null;
        draggedToken = null;
        remoteMeasurements.clear();
        remoteTokenDrags.clear();
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
        renderInitiativeBar();
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
          // Remove from initiative tracker too (server cleans up state, client mirrors it)
          if (removeScene.initiative) {
            for (const zone of removeScene.initiative.zones) {
              zone.entries = zone.entries.filter(e => e.tokenId !== message.id);
            }
          }
          renderInitiativeBar();
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

      case 'token:move-to-scene':
        // Move token from active scene to target scene in local state
        const moveFromScene = getActiveScene();
        const moveToScene = gameState.scenes.find(s => s.id === message.targetSceneId);
        if (moveFromScene && moveToScene) {
          const tokenIndex = moveFromScene.tokens.findIndex(t => t.id === message.tokenId);
          if (tokenIndex !== -1) {
            const [movedToken] = moveFromScene.tokens.splice(tokenIndex, 1);
            moveToScene.tokens.push(movedToken);
          }
          if (selectedTokenId === message.tokenId) {
            selectedTokenId = null;
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
        setBackgroundReady(false);
        // Clear measurements on scene switch
        remoteMeasurements.clear();
        wsClient.clearMeasurement(playerId);
        // Clear and reload drawing layers
        dmDrawingLayer.clear();
        playerDrawingLayer.clear();
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
        renderInitiativeBar();
        break;

      case 'scene:rename':
        const renamedScene = gameState.scenes.find(s => s.id === message.sceneId);
        if (renamedScene) {
          renamedScene.name = message.name;
        }
        updateSceneSelector(gameState.scenes, gameState.activeSceneId);
        break;

      case 'draw:stroke':
        // Apply remote stroke for real-time preview to correct layer
        if (message.sceneId === gameState.activeSceneId) {
          const targetLayer = message.layer === 'dm' ? dmDrawingLayer : playerDrawingLayer;
          targetLayer.applyRemoteStroke(message.stroke);
        }
        break;

      case 'draw:chunk':
        // Load updated chunk to correct layer
        if (message.sceneId === gameState.activeSceneId) {
          const targetLayer = message.layer === 'dm' ? dmDrawingLayer : playerDrawingLayer;
          targetLayer.loadChunk(message.chunkKey, message.data);
        }
        break;

      case 'draw:sync':
        // Load all chunks for the scene into both layers
        if (message.sceneId === gameState.activeSceneId) {
          dmDrawingLayer.loadAllChunks(message.dmChunks);
          playerDrawingLayer.loadAllChunks(message.playerChunks);
          setBackgroundReady(true);
        }
        break;

      case 'draw:clear':
        // Clear specified layers
        if (message.sceneId === gameState.activeSceneId) {
          for (const layer of message.layers) {
            if (layer === 'dm') dmDrawingLayer.clear();
            if (layer === 'player') playerDrawingLayer.clear();
          }
        }
        break;

      case 'token:drag:update':
        // Store remote drag preview (ignore our own)
        if (message.playerId !== playerId) {
          remoteTokenDrags.set(message.playerId, {
            tokenId: message.tokenId,
            x: message.x,
            y: message.y,
            startX: message.startX,
            startY: message.startY,
          });
        }
        break;

      case 'token:drag:clear':
        // Clear remote drag preview (ignore our own)
        if (message.playerId !== playerId) {
          remoteTokenDrags.delete(message.playerId);
        }
        break;

      case 'initiative:update': {
        const initScene = gameState.scenes.find(s => s.id === message.sceneId);
        if (initScene) {
          if (!initScene.initiative) initScene.initiative = { zones: [] };
          initScene.initiative.zones = message.zones;
          renderInitiativeBar();
        }
        break;
      }
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
          tool: localMeasurement.tool as 'line' | 'circle' | 'cone' | 'cube',
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

    render(gameState, toolState, selectedTokenId, viewState, remoteMeasurements, highlightedTokenIds, dragDropState, dmDrawingLayer, playerDrawingLayer, drawingOpacity, remoteTokenDrags);
    requestAnimationFrame(renderLoop);
  }
  renderLoop();
}

function setupEventHandlers(): void {
  setOnToolChange((tool: Tool) => {
    setTool(toolState, tool);
    selectedTokenId = null;
    // Track the last tool used (for restoring after draw mode)
    lastToolBeforeDrawMode = tool;
    // Exit draw mode when selecting a regular tool
    drawModeEnabled = false;
    getActiveDrawingLayer().updateCursor(0, 0, false);
    // Deselect any active draw tool
    document.querySelectorAll('.draw-tool-btn').forEach(btn => btn.classList.remove('active'));
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
      // Restore last tool when exiting draw mode
      setTool(toolState, lastToolBeforeDrawMode);
      setActiveTool(lastToolBeforeDrawMode);
      // Hide cursor preview
      getActiveDrawingLayer().updateCursor(0, 0, false);
    }
  });

  setOnDrawToolChange((tool: DrawTool) => {
    getActiveDrawingLayer().setBrush({ tool });
    // Ensure draw mode is active and regular tools are deselected
    drawModeEnabled = true;
    document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
  });

  setOnDrawColorChange((color: string) => {
    getActiveDrawingLayer().setBrush({ color });
  });

  setOnDrawBrushSizeChange((size: number) => {
    getActiveDrawingLayer().setBrush({ size });
  });

  setOnDrawClear(() => {
    const activeScene = getActiveScene();
    if (activeScene) {
      if (isDmMode()) {
        wsClient.clearDrawing(activeScene.id, ['dm', 'player']);
      } else {
        wsClient.clearDrawing(activeScene.id, ['player']);
      }
    }
  });

  setOnDrawingOpacityChange((opacity: number) => {
    drawingOpacity = opacity;
  });

  setOnEraseModeChange((enabled: boolean) => {
    getActiveDrawingLayer().setBrush({ eraseMode: enabled });
  });

  // Sync brush settings when DM mode is toggled
  setOnDmModeToggle((isNowDm: boolean) => {
    if (drawModeEnabled) {
      // Copy brush settings from the old layer to the new active layer
      const oldLayer = isNowDm ? playerDrawingLayer : dmDrawingLayer;
      const newLayer = isNowDm ? dmDrawingLayer : playerDrawingLayer;
      const brush = oldLayer.getBrush();
      newLayer.setBrush(brush);
    }
    // Re-render initiative bar to show/hide DM-only elements (handles, add-zone button)
    renderInitiativeBar();
  });
}

function setupCanvasEvents(canvas: HTMLCanvasElement): void {
  // Helper function to get pinch distance between two pointers
  function getPinchDistance(): number {
    if (activePointers.size < 2) return 0;
    const points = Array.from(activePointers.values());
    const dx = points[1].x - points[0].x;
    const dy = points[1].y - points[0].y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Helper function to get pinch center between two pointers
  function getPinchCenter(): { x: number; y: number } {
    if (activePointers.size < 2) return { x: 0, y: 0 };
    const points = Array.from(activePointers.values());
    return {
      x: (points[0].x + points[1].x) / 2,
      y: (points[0].y + points[1].y) / 2,
    };
  }

  canvas.addEventListener('pointerdown', (e) => {
    // Detect input type and switch modes
    if (e.pointerType === 'touch' && !getIsMobileMode()) {
      setMobileMode(true);
      setTool(toolState, 'pan-zoom');
    } else if (e.pointerType === 'mouse' && getIsMobileMode()) {
      setMobileMode(false);
      setTool(toolState, 'move');
    }

    // Hide context menu on any click
    hideContextMenu();

    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    // Ignore 3rd+ touch inputs - don't even add them to tracking
    if (activePointers.size >= 2) {
      return;
    }

    // Track active pointers for multi-touch
    activePointers.set(e.pointerId, { x: screenX, y: screenY });

    // For touch, capture pointer for proper tracking
    if (e.pointerType === 'touch') {
      canvas.setPointerCapture(e.pointerId);
    }

    // Right-click starts panning (desktop only)
    if (e.button === 2 && !getIsMobileMode()) {
      isRightMouseDown = true;
      hasPanned = false;
      startPan(viewState, screenX, screenY);
      return;
    }

    // Handle pinch-to-zoom start (second finger) - only in pan-zoom mode
    if (activePointers.size === 2) {
      // Clear any long press timer when second finger touches
      if (longPressTimer !== null) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      if (toolState.currentTool === 'pan-zoom') {
        lastPinchDistance = getPinchDistance();
      }
      return;
    }

    // Only process single-pointer actions for first pointer
    if (activePointers.size > 1) return;

    // Convert screen coordinates to world coordinates
    const world = screenToWorld(viewState, screenX, screenY);
    const x = world.x;
    const y = world.y;

    // Pan-zoom mode: start panning (but check for token first on mobile for long-press)
    if (toolState.currentTool === 'pan-zoom') {
      // On mobile, check if we're touching a token - allow long-press to drag it
      if (getIsMobileMode()) {
        const activeScenePanZoom = getActiveScene();
        if (activeScenePanZoom) {
          const token = findTokenAtPoint(x, y, activeScenePanZoom.tokens, activeScenePanZoom.map.gridSize);
          if (token) {
            // Don't start panning - wait for long-press to drag token
            if (longPressTimer !== null) {
              clearTimeout(longPressTimer);
            }
            longPressTriggered = false;

            longPressTimer = window.setTimeout(() => {
              longPressTriggered = true;
              longPressTimer = null;

              // Start dragging the token
              selectedTokenId = token.id;
              draggedToken = token;
              dragOffsetX = x - token.x;
              dragOffsetY = y - token.y;
              const tokenWidth = token.gridWidth * activeScenePanZoom.map.gridSize;
              const tokenHeight = token.gridHeight * activeScenePanZoom.map.gridSize;
              // Switch to move tool first, then start drag (setTool resets isDragging)
              setTool(toolState, 'move');
              startDrag(toolState, token.x + tokenWidth / 2, token.y + tokenHeight / 2);
            }, LONG_PRESS_DURATION);
            return;
          }
        }
      }
      // Not on a token (or not mobile) - start panning
      isRightMouseDown = true; // Reuse pan state
      hasPanned = false;
      startPan(viewState, screenX, screenY);
      return;
    }

    // Drawing mode handling (desktop only)
    if (drawModeEnabled && !getIsMobileMode()) {
      const activeLayer = getActiveDrawingLayer();
      const brush = activeLayer.getBrush();
      if (brush.tool === 'fill') {
        // Flood fill on click (async, fire-and-forget)
        activeLayer.floodFill(x, y).catch((err) => {
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
        activeLayer.setBrush({ color: hexColor });
      } else {
        // Start drawing stroke
        isDrawing = true;
        activeLayer.beginStroke(x, y);
      }
      return;
    }

    // Long press detection for mobile - works in move mode to initiate token drag
    if (getIsMobileMode() && toolState.currentTool === 'move') {
      const activeSceneLongPress = getActiveScene();
      if (activeSceneLongPress) {
        const token = findTokenAtPoint(x, y, activeSceneLongPress.tokens, activeSceneLongPress.map.gridSize);
        if (token) {
          // Clear any existing long press timer
          if (longPressTimer !== null) {
            clearTimeout(longPressTimer);
          }
          longPressTriggered = false;

          // Start long press timer
          longPressTimer = window.setTimeout(() => {
            longPressTriggered = true;
            longPressTimer = null;

            // Start dragging the token
            selectedTokenId = token.id;
            draggedToken = token;
            dragOffsetX = x - token.x;
            dragOffsetY = y - token.y;
            const tokenWidth = token.gridWidth * activeSceneLongPress.map.gridSize;
            const tokenHeight = token.gridHeight * activeSceneLongPress.map.gridSize;
            startDrag(toolState, token.x + tokenWidth / 2, token.y + tokenHeight / 2);
          }, LONG_PRESS_DURATION);
        }
      }
    } else if (toolState.currentTool === 'move') {
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
      // Measurement tools (line, circle, cone, cube, grid-align)
      let sx = x;
      let sy = y;
      if (toolState.currentTool !== 'grid-align') {
        const activeSceneSnap = getActiveScene();
        if (activeSceneSnap) {
          const shouldSnap = ctrlKeyPressed ? !snapToGrid : snapToGrid;
          if (shouldSnap) {
            const gs = activeSceneSnap.map.gridSize;
            const ox = activeSceneSnap.map.gridOffsetX || 0;
            const oy = activeSceneSnap.map.gridOffsetY || 0;
            sx = snapMeasurementPoint(x, gs, ox);
            sy = snapMeasurementPoint(y, gs, oy);
          }
        }
      }
      startDrag(toolState, sx, sy);
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    // Update pointer tracking
    if (activePointers.has(e.pointerId)) {
      activePointers.set(e.pointerId, { x: screenX, y: screenY });
    }

    // Handle pinch-to-zoom (only in pan-zoom mode)
    if (activePointers.size === 2 && lastPinchDistance > 0 && toolState.currentTool === 'pan-zoom') {
      const newDistance = getPinchDistance();
      const center = getPinchCenter();

      if (newDistance > 0 && lastPinchDistance > 0) {
        const scale = newDistance / lastPinchDistance;
        // Calculate zoom delta (similar to wheel zoom)
        const zoomDelta = (1 - scale) * 500;
        applyZoom(viewState, zoomDelta, center.x, center.y);
      }

      lastPinchDistance = newDistance;
      return;
    }

    // Clear long press if pointer moves significantly
    if (longPressTimer !== null) {
      const startPointer = activePointers.values().next().value;
      if (startPointer) {
        const dx = screenX - startPointer.x;
        const dy = screenY - startPointer.y;
        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
      }
    }

    // Handle panning (right-click or pan-zoom mode)
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

    // Update drawing cursor position (desktop only)
    if (drawModeEnabled && !getIsMobileMode()) {
      const activeLayer = getActiveDrawingLayer();
      const brush = activeLayer.getBrush();
      const showCursor = brush.tool === 'brush';
      activeLayer.updateCursor(x, y, showCursor);
    } else {
      getActiveDrawingLayer().updateCursor(0, 0, false);
    }

    // Drawing mode handling (desktop only)
    if (drawModeEnabled && isDrawing && !getIsMobileMode()) {
      getActiveDrawingLayer().continueStroke(x, y);
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

          // Send token drag update to other players (throttled)
          const now = Date.now();
          if (now - lastTokenDragUpdate >= TOKEN_DRAG_THROTTLE_MS) {
            lastTokenDragUpdate = now;
            wsClient.updateTokenDrag(draggedToken.id, playerId, newX, newY, toolState.startX, toolState.startY);
          }
        }
      } else if (toolState.currentTool !== 'pan-zoom') {
        let mx = x;
        let my = y;
        if (toolState.currentTool !== 'grid-align') {
          const activeSceneSnap = getActiveScene();
          if (activeSceneSnap) {
            const shouldSnap = ctrlKeyPressed ? !snapToGrid : snapToGrid;
            if (shouldSnap) {
              const gs = activeSceneSnap.map.gridSize;
              const ox = activeSceneSnap.map.gridOffsetX || 0;
              const oy = activeSceneSnap.map.gridOffsetY || 0;
              mx = snapMeasurementPoint(x, gs, ox);
              my = snapMeasurementPoint(y, gs, oy);
            }
          }
        }
        updateDrag(toolState, mx, my);

        // Send measurement update to other players (throttled)
        if (toolState.currentTool !== 'move' && toolState.currentTool !== 'grid-align') {
          const now = Date.now();
          if (now - lastMeasurementUpdate >= MEASUREMENT_THROTTLE_MS) {
            lastMeasurementUpdate = now;
            const measurement: Measurement = {
              id: generateUUID(),
              playerId: playerId,
              tool: toolState.currentTool as 'line' | 'circle' | 'cone' | 'cube',
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

  canvas.addEventListener('pointerup', (e) => {
    // Remove pointer from tracking
    activePointers.delete(e.pointerId);

    // Clear long press timer
    if (longPressTimer !== null) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }

    // Reset pinch distance when fewer than 2 fingers
    if (activePointers.size < 2) {
      lastPinchDistance = 0;
    }

    // Handle right-click release or pan-zoom end
    if (e.button === 2 || (toolState.currentTool === 'pan-zoom' && isRightMouseDown)) {
      isRightMouseDown = false;
      endPan(viewState);
      return;
    }

    // Drawing mode handling (desktop only)
    if (drawModeEnabled && isDrawing && !getIsMobileMode()) {
      isDrawing = false;
      getActiveDrawingLayer().endStroke();
      return;
    }

    if (toolState.currentTool === 'move' && draggedToken) {
      wsClient.moveToken(draggedToken.id, draggedToken.x, draggedToken.y);
      // Clear the token drag preview for other players
      wsClient.clearTokenDrag(draggedToken.id, playerId);
      draggedToken = null;
      // On mobile, switch back to pan-zoom mode after token drag
      if (getIsMobileMode()) {
        setTool(toolState, 'pan-zoom');
      }
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
    } else if (toolState.currentTool !== 'move' && toolState.currentTool !== 'grid-align' && toolState.currentTool !== 'pan-zoom' && toolState.isDragging) {
      // Clear measurement from other players' views
      wsClient.clearMeasurement(playerId);
    }
    endDrag(toolState);
  });

  canvas.addEventListener('pointercancel', (e) => {
    // Clean up on pointer cancel (e.g., touch interrupted)
    activePointers.delete(e.pointerId);

    // Clear long press timer
    if (longPressTimer !== null) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }

    if (activePointers.size < 2) {
      lastPinchDistance = 0;
    }
    if (activePointers.size === 0) {
      isRightMouseDown = false;
      endPan(viewState);
      endDrag(toolState);
    }
  });

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();

    // Don't show context menu on mobile
    if (getIsMobileMode()) {
      return;
    }

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

  // Zoom with scroll wheel (desktop only - mobile uses pinch)
  canvas.addEventListener('wheel', (e) => {
    if (getIsMobileMode()) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;
    applyZoom(viewState, e.deltaY, cursorX, cursorY);
  }, { passive: false });

  // Hide drawing cursor when leaving canvas
  canvas.addEventListener('pointerleave', () => {
    getActiveDrawingLayer().updateCursor(0, 0, false);
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

  // Populate scene submenu with other scenes
  const sceneSubmenu = document.getElementById('scene-submenu');
  const moveToSceneSubmenu = document.getElementById('move-to-scene-submenu');
  if (sceneSubmenu && moveToSceneSubmenu) {
    sceneSubmenu.innerHTML = '';
    const otherScenes = gameState.scenes.filter(s => s.id !== gameState.activeSceneId);

    if (otherScenes.length === 0) {
      // Disable the submenu trigger when no other scenes
      const trigger = moveToSceneSubmenu.querySelector('.submenu-trigger');
      if (trigger) {
        trigger.classList.add('disabled');
      }
    } else {
      const trigger = moveToSceneSubmenu.querySelector('.submenu-trigger');
      if (trigger) {
        trigger.classList.remove('disabled');
      }
      otherScenes.forEach(scene => {
        const btn = document.createElement('button');
        btn.className = 'context-menu-item';
        btn.dataset.action = 'move-to-scene-target';
        btn.dataset.sceneId = scene.id;
        btn.textContent = scene.name;
        sceneSubmenu.appendChild(btn);
      });
    }
  }

  // Toggle initiative context menu items
  const addToInitBtn = menu.querySelector('[data-action="add-to-initiative"]') as HTMLElement | null;
  const removeFromInitBtn = menu.querySelector('[data-action="remove-from-initiative"]') as HTMLElement | null;
  if (addToInitBtn && removeFromInitBtn) {
    const inInit = isTokenInInitiative(tokenId);
    addToInitBtn.classList.toggle('hidden', inInit);
    removeFromInitBtn.classList.toggle('hidden', !inInit);
  }

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
    } else if (action === 'duplicate' && contextMenuTokenId) {
      const activeScene = getActiveScene();
      if (activeScene) {
        const token = activeScene.tokens.find(t => t.id === contextMenuTokenId);
        if (token) {
          const gridSize = activeScene.map.gridSize;
          const newToken: Token = {
            id: generateUUID(),
            x: token.x + gridSize,
            y: token.y + gridSize,
            imageUrl: token.imageUrl,
            gridWidth: token.gridWidth,
            gridHeight: token.gridHeight,
            name: token.name,
          };
          wsClient.addToken(newToken);
        }
      }
      hideContextMenu();
    } else if (action === 'move-to-scene-target' && contextMenuTokenId) {
      const targetSceneId = target.dataset.sceneId;
      if (targetSceneId) {
        wsClient.moveTokenToScene(contextMenuTokenId, targetSceneId);
      }
      hideContextMenu();
    } else if (action === 'move-to-scene') {
      // Don't close menu - let user hover to see submenu
      // Check if disabled
      if (target.classList.contains('disabled')) {
        return;
      }
    } else if (action === 'add-to-initiative' && contextMenuTokenId) {
      wsClient.send({ type: 'initiative:add-token', tokenId: contextMenuTokenId });
      hideContextMenu();
    } else if (action === 'remove-from-initiative' && contextMenuTokenId) {
      wsClient.send({ type: 'initiative:remove-token', tokenId: contextMenuTokenId });
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

function setupFullscreenButton(): void {
  const fullscreenBtn = document.getElementById('fullscreen-btn');
  const fullscreenIcon = document.getElementById('fullscreen-icon');
  const exitFullscreenIcon = document.getElementById('exit-fullscreen-icon');

  if (!fullscreenBtn) return;

  function updateFullscreenIcons(): void {
    const isFullscreen = !!document.fullscreenElement;
    if (fullscreenIcon) fullscreenIcon.style.display = isFullscreen ? 'none' : 'block';
    if (exitFullscreenIcon) exitFullscreenIcon.style.display = isFullscreen ? 'block' : 'none';
    document.body.classList.toggle('fullscreen-mode', isFullscreen);
  }

  fullscreenBtn.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch (error) {
      console.error('Fullscreen error:', error);
    }
  });

  document.addEventListener('fullscreenchange', updateFullscreenIcons);
}

// ── Initiative Tracker ─────────────────────────────────────────────────────────

function getInitiativeZones(): InitiativeZone[] {
  return getActiveScene()?.initiative?.zones ?? [];
}

function isTokenInInitiative(tokenId: string): boolean {
  return getInitiativeZones().some(z => z.entries.some(e => e.tokenId === tokenId));
}

function setInitiativeCollapsed(collapsed: boolean): void {
  initiativeCollapsed = collapsed;
  localStorage.setItem('simple-vtt-initiative-collapsed', String(collapsed));
  document.getElementById('initiative-bar')?.classList.toggle('hidden', collapsed);
  document.getElementById('expand-initiative-btn')?.classList.toggle('hidden', !collapsed);
  resizeCanvas();
}

function renderInitiativeBar(): void {
  const zonesContainer = document.getElementById('initiative-zones');
  if (!zonesContainer) return;

  const zones = getInitiativeZones();
  const dm = isDmMode();
  const tokens = getActiveScene()?.tokens ?? [];

  zonesContainer.innerHTML = '';

  zones.forEach(zone => {
    const zoneEl = document.createElement('div');
    zoneEl.className = 'initiative-zone';
    zoneEl.dataset.zoneId = zone.id;

    // Apply custom zone color
    if (zone.color) {
      const hex = zone.color.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      zoneEl.style.borderColor = zone.color;
      zoneEl.style.backgroundColor = `rgba(${r}, ${g}, ${b}, 0.12)`;
    }

    // Background watermark title
    const titleEl = document.createElement('div');
    titleEl.className = 'initiative-zone-title';
    titleEl.textContent = zone.title;
    zoneEl.appendChild(titleEl);

    // DM-only handle column (color picker + drag handle)
    if (dm) {
      const handleCol = document.createElement('div');
      handleCol.className = 'initiative-zone-handle-col';

      // Color picker button
      const colorInput = document.createElement('input') as HTMLInputElement;
      colorInput.type = 'color';
      colorInput.className = 'initiative-zone-color-btn';
      colorInput.title = 'Zone color';
      colorInput.value = zone.color ?? '#4a4a6e';
      colorInput.dataset.zoneId = zone.id;
      // Prevent mousedown from triggering zone drag
      colorInput.addEventListener('mousedown', (e) => e.stopPropagation());
      colorInput.addEventListener('change', () => {
        updateZoneColor(zone.id, colorInput.value);
      });
      handleCol.appendChild(colorInput);

      // Drag handle
      const handle = document.createElement('div');
      handle.className = 'initiative-zone-handle';
      handle.dataset.zoneId = zone.id;
      handle.title = 'Drag to reorder';
      handle.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <line x1="4" y1="7" x2="20" y2="7"/>
        <line x1="4" y1="12" x2="20" y2="12"/>
        <line x1="4" y1="17" x2="20" y2="17"/>
      </svg>`;
      handleCol.appendChild(handle);

      // Remove zone button
      const removeBtn = document.createElement('button');
      removeBtn.className = 'initiative-zone-remove-btn';
      removeBtn.title = 'Remove zone';
      removeBtn.textContent = '×';
      removeBtn.dataset.zoneId = zone.id;
      removeBtn.addEventListener('mousedown', (e) => e.stopPropagation());
      removeBtn.addEventListener('click', () => {
        wsClient.send({ type: 'initiative:remove-zone', zoneId: zone.id });
      });
      handleCol.appendChild(removeBtn);

      zoneEl.appendChild(handleCol);
    }

    // Token thumbnails in their own flex container
    const tokensArea = document.createElement('div');
    tokensArea.className = 'initiative-zone-tokens';
    tokensArea.dataset.zoneId = zone.id;

    zone.entries.forEach(entry => {
      const token = tokens.find(t => t.id === entry.tokenId);
      if (!token) return;

      const img = document.createElement('img') as HTMLImageElement;
      img.className = 'initiative-token-thumb';
      img.src = token.imageUrl;
      img.title = token.name ?? token.label ?? '';
      img.dataset.tokenId = token.id;
      img.dataset.zoneId = zone.id;
      img.draggable = false;
      tokensArea.appendChild(img);
    });

    zoneEl.appendChild(tokensArea);
    zonesContainer.appendChild(zoneEl);
  });

  // Show/hide add zone button based on DM mode
  const addZoneBtn = document.getElementById('add-initiative-zone-btn');
  if (addZoneBtn) {
    (addZoneBtn as HTMLElement).style.display = dm ? '' : 'none';
  }
}

function updateZoneColor(zoneId: string, color: string): void {
  const zones = getInitiativeZones();
  const newZones: InitiativeZone[] = JSON.parse(JSON.stringify(zones));
  const zone = newZones.find(z => z.id === zoneId);
  if (!zone) return;
  zone.color = color;

  const activeScene = getActiveScene();
  if (!activeScene) return;

  if (!activeScene.initiative) activeScene.initiative = { zones: [] };
  activeScene.initiative.zones = newZones;
  renderInitiativeBar();

  wsClient.send({ type: 'initiative:update', sceneId: activeScene.id, zones: newZones });
}

function setupInitiativeTracker(): void {
  // Apply initial collapsed state (before first render)
  const bar = document.getElementById('initiative-bar');
  const expandBtn = document.getElementById('expand-initiative-btn');
  if (bar) bar.classList.toggle('hidden', initiativeCollapsed);
  if (expandBtn) expandBtn.classList.toggle('hidden', !initiativeCollapsed);
  // Recalculate canvas size now that we know the bar's visibility
  resizeCanvas();

  document.getElementById('collapse-initiative-btn')?.addEventListener('click', () => {
    setInitiativeCollapsed(true);
  });

  document.getElementById('expand-initiative-btn')?.addEventListener('click', () => {
    setInitiativeCollapsed(false);
  });

  document.getElementById('add-initiative-zone-btn')?.addEventListener('click', () => {
    const title = prompt('Zone name:');
    if (title && title.trim()) {
      wsClient.send({ type: 'initiative:add-zone', title: title.trim() });
    }
  });

  setupInitiativeDragDrop();
}

function setupInitiativeDragDrop(): void {
  // ── Token drag ────────────────────────────────────────────────────────────

  document.addEventListener('mousedown', (e) => {
    const target = e.target as HTMLElement;

    if (target.classList.contains('initiative-token-thumb')) {
      e.preventDefault();
      e.stopPropagation();

      initiativeDragTokenId = target.dataset.tokenId ?? null;

      // Create ghost image
      const ghost = document.createElement('img') as HTMLImageElement;
      ghost.className = 'initiative-drag-ghost';
      ghost.src = (target as HTMLImageElement).src;
      ghost.style.left = `${e.clientX}px`;
      ghost.style.top = `${e.clientY}px`;
      document.body.appendChild(ghost);
      initiativeDragGhostEl = ghost;

      // Create drop placeholder (detached until we hover a zone)
      initiativePlaceholder = document.createElement('div');
      initiativePlaceholder.className = 'initiative-drop-placeholder';

      return;
    }

    // ── Zone handle drag (DM only) ────────────────────────────────────────
    const handleEl = target.closest('.initiative-zone-handle') as HTMLElement | null;
    if (handleEl && isDmMode()) {
      e.preventDefault();
      e.stopPropagation();

      initiativeZoneDragId = handleEl.dataset.zoneId ?? null;

      const zoneEl = handleEl.closest('.initiative-zone') as HTMLElement | null;
      const title = zoneEl?.querySelector('.initiative-zone-title')?.textContent ?? '';

      const ghost = document.createElement('div');
      ghost.className = 'initiative-zone-ghost';
      ghost.textContent = title;
      if (zoneEl) ghost.style.width = `${zoneEl.offsetWidth}px`;
      ghost.style.left = `${e.clientX}px`;
      ghost.style.top = `${e.clientY}px`;
      document.body.appendChild(ghost);
      initiativeZoneDragGhostEl = ghost;

      initiativeZonePlaceholder = document.createElement('div');
      initiativeZonePlaceholder.className = 'initiative-zone-drop-placeholder';
      if (zoneEl) initiativeZonePlaceholder.style.minWidth = `${zoneEl.offsetWidth}px`;
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (initiativeDragGhostEl && initiativeDragTokenId !== null) {
      initiativeDragGhostEl.style.left = `${e.clientX}px`;
      initiativeDragGhostEl.style.top = `${e.clientY}px`;
      updateInitiativeTokenDropTarget(e.clientX, e.clientY);
      return;
    }

    if (initiativeZoneDragGhostEl && initiativeZoneDragId !== null) {
      initiativeZoneDragGhostEl.style.left = `${e.clientX}px`;
      initiativeZoneDragGhostEl.style.top = `${e.clientY}px`;
      updateInitiativeZoneDropTarget(e.clientX, e.clientY);
    }
  });

  document.addEventListener('mouseup', () => {
    if (initiativeDragTokenId !== null) {
      if (initiativeDropZoneId !== null && initiativeDropIndex !== -1) {
        commitInitiativeTokenDrop();
      }
      cleanupInitiativeTokenDrag();
    }

    if (initiativeZoneDragId !== null) {
      if (initiativeZoneDropIndex !== -1) {
        commitInitiativeZoneDrop();
      }
      cleanupInitiativeZoneDrag();
    }
  });
}

function updateInitiativeTokenDropTarget(clientX: number, clientY: number): void {
  // Ghost is pointer-events:none so elementFromPoint works directly
  const el = document.elementFromPoint(clientX, clientY);
  const zoneEl = el?.closest('.initiative-zone') as HTMLElement | null;

  // Remove placeholder from its current parent
  initiativePlaceholder?.remove();

  document.querySelectorAll('.initiative-zone').forEach(z => z.classList.remove('drag-over'));

  if (zoneEl) {
    initiativeDropZoneId = zoneEl.dataset.zoneId ?? null;

    // Find insertion index based on cursor X among existing thumbs
    const thumbs = Array.from(
      zoneEl.querySelectorAll('.initiative-token-thumb')
    ) as HTMLElement[];

    let insertIndex = thumbs.length;
    for (let i = 0; i < thumbs.length; i++) {
      const rect = thumbs[i].getBoundingClientRect();
      if (clientX < rect.left + rect.width / 2) {
        insertIndex = i;
        break;
      }
    }
    initiativeDropIndex = insertIndex;

    // Insert placeholder at computed position inside the tokens area
    if (initiativePlaceholder) {
      const tokensArea = (zoneEl.querySelector('.initiative-zone-tokens') as HTMLElement | null) ?? zoneEl;
      if (insertIndex < thumbs.length) {
        tokensArea.insertBefore(initiativePlaceholder, thumbs[insertIndex]);
      } else {
        tokensArea.appendChild(initiativePlaceholder);
      }
    }

    zoneEl.classList.add('drag-over');
  } else {
    initiativeDropZoneId = null;
    initiativeDropIndex = -1;
  }
}

function commitInitiativeTokenDrop(): void {
  if (!initiativeDragTokenId || !initiativeDropZoneId) return;

  const zones = getInitiativeZones();
  const newZones: InitiativeZone[] = JSON.parse(JSON.stringify(zones));

  // Remove token from all zones
  for (const zone of newZones) {
    zone.entries = zone.entries.filter(e => e.tokenId !== initiativeDragTokenId);
  }

  const targetZone = newZones.find(z => z.id === initiativeDropZoneId);
  if (!targetZone) return;

  const insertIdx = Math.min(initiativeDropIndex, targetZone.entries.length);
  targetZone.entries.splice(insertIdx, 0, { tokenId: initiativeDragTokenId! });

  const activeScene = getActiveScene();
  if (!activeScene) return;

  // Optimistic update
  if (!activeScene.initiative) activeScene.initiative = { zones: [] };
  activeScene.initiative.zones = newZones;
  renderInitiativeBar();

  wsClient.send({ type: 'initiative:update', sceneId: activeScene.id, zones: newZones });
}

function cleanupInitiativeTokenDrag(): void {
  initiativeDragGhostEl?.remove();
  initiativeDragGhostEl = null;
  initiativePlaceholder?.remove();
  initiativePlaceholder = null;
  initiativeDragTokenId = null;
  initiativeDropZoneId = null;
  initiativeDropIndex = -1;
  document.querySelectorAll('.initiative-zone').forEach(z => z.classList.remove('drag-over'));
}

function updateInitiativeZoneDropTarget(clientX: number, clientY: number): void {
  const container = document.getElementById('initiative-zones');
  if (!container) return;

  initiativeZonePlaceholder?.remove();

  const allZones = Array.from(
    container.querySelectorAll('.initiative-zone')
  ) as HTMLElement[];

  let insertIndex = allZones.length;
  for (let i = 0; i < allZones.length; i++) {
    const rect = allZones[i].getBoundingClientRect();
    if (clientX < rect.left + rect.width / 2) {
      insertIndex = i;
      break;
    }
  }
  initiativeZoneDropIndex = insertIndex;

  if (initiativeZonePlaceholder) {
    if (insertIndex < allZones.length) {
      container.insertBefore(initiativeZonePlaceholder, allZones[insertIndex]);
    } else {
      container.appendChild(initiativeZonePlaceholder);
    }
  }
}

function commitInitiativeZoneDrop(): void {
  if (!initiativeZoneDragId) return;

  const zones = getInitiativeZones();
  const newZones: InitiativeZone[] = JSON.parse(JSON.stringify(zones));

  const draggedIdx = newZones.findIndex(z => z.id === initiativeZoneDragId);
  if (draggedIdx === -1) return;

  const [draggedZone] = newZones.splice(draggedIdx, 1);

  // Adjust insertIndex since one zone was removed before the target index
  let insertIdx = initiativeZoneDropIndex;
  if (draggedIdx < insertIdx) insertIdx--;
  insertIdx = Math.min(Math.max(0, insertIdx), newZones.length);

  newZones.splice(insertIdx, 0, draggedZone);

  const activeScene = getActiveScene();
  if (!activeScene) return;

  // Optimistic update
  if (!activeScene.initiative) activeScene.initiative = { zones: [] };
  activeScene.initiative.zones = newZones;
  renderInitiativeBar();

  wsClient.send({ type: 'initiative:update', sceneId: activeScene.id, zones: newZones });
}

function cleanupInitiativeZoneDrag(): void {
  initiativeZoneDragGhostEl?.remove();
  initiativeZoneDragGhostEl = null;
  initiativeZonePlaceholder?.remove();
  initiativeZonePlaceholder = null;
  initiativeZoneDragId = null;
  initiativeZoneDropIndex = -1;
}

// Prevent browser UI from scrolling back on touch drag (mobile address bar)
document.addEventListener('touchmove', (e) => {
  // Only prevent if we're interacting with the canvas
  if ((e.target as HTMLElement)?.closest('#game-canvas')) {
    e.preventDefault();
  }
}, { passive: false });

// Prevent pull-to-refresh and other browser gestures
document.addEventListener('touchstart', (e) => {
  if ((e.target as HTMLElement)?.closest('#game-canvas')) {
    // Allow single touch for our handlers, but prevent browser gestures
    if (e.touches.length > 1) {
      e.preventDefault();
    }
  }
}, { passive: false });

document.addEventListener('DOMContentLoaded', init);
