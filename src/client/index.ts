import { GameState, Token, Measurement, DEFAULT_GAME_STATE } from '../shared/types.js';
import { wsClient } from './websocket.js';
import { initCanvas, render, loadBackground, getCanvas, resizeCanvas } from './canvas.js';
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
  setOnScaleChange,
} from './ui.js';
import { createViewState, ViewState, screenToWorld, startPan, updatePan, endPan, applyZoom } from './viewState.js';
import { getTokensInMeasurement } from './geometry.js';

let gameState: GameState = { ...DEFAULT_GAME_STATE, tokens: [], map: { ...DEFAULT_GAME_STATE.map } };
let toolState: ToolState = createToolState();
let viewState: ViewState = createViewState();
let selectedTokenId: string | null = null;
let draggedToken: Token | null = null;
let dragOffsetX = 0;
let dragOffsetY = 0;

// Player ID for measurement sync
const playerId = crypto.randomUUID();

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

  wsClient.onMessage((message) => {
    switch (message.type) {
      case 'sync':
        gameState = message.state;
        updateUIFromState(gameState.map);
        if (gameState.map.backgroundUrl) {
          loadBackground(gameState.map.backgroundUrl);
        }
        gameState.tokens.forEach(token => loadTokenImage(token));
        break;

      case 'token:add':
        gameState.tokens.push(message.token);
        loadTokenImage(message.token);
        break;

      case 'token:move':
        const token = gameState.tokens.find(t => t.id === message.id);
        if (token) {
          token.x = message.x;
          token.y = message.y;
        }
        break;

      case 'token:remove':
        gameState.tokens = gameState.tokens.filter(t => t.id !== message.id);
        if (selectedTokenId === message.id) {
          selectedTokenId = null;
        }
        break;

      case 'token:resize':
        const resizedToken = gameState.tokens.find(t => t.id === message.id);
        if (resizedToken) {
          resizedToken.width = message.width;
          resizedToken.height = message.height;
        }
        break;

      case 'map:set':
        gameState.map.backgroundUrl = message.backgroundUrl;
        loadBackground(message.backgroundUrl);
        break;

      case 'map:scale':
        gameState.map.pixelsPerFoot = message.pixelsPerFoot;
        updateUIFromState(gameState.map);
        break;

      case 'map:grid':
        gameState.map.gridEnabled = message.enabled;
        if (message.size !== undefined) {
          gameState.map.gridSize = message.size;
        }
        updateUIFromState(gameState.map);
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
    }
  });

  wsClient.connect();

  function renderLoop(): void {
    // Calculate highlighted tokens from all active measurements
    highlightedTokenIds = new Set<string>();

    // Check local measurement
    const localMeasurement = getCurrentMeasurement(toolState);
    if (localMeasurement && localMeasurement.tool !== 'select') {
      const measurement: Measurement = {
        id: 'local',
        playerId: playerId,
        tool: localMeasurement.tool,
        startX: localMeasurement.startX,
        startY: localMeasurement.startY,
        endX: localMeasurement.endX,
        endY: localMeasurement.endY,
      };
      const tokenIds = getTokensInMeasurement(measurement, gameState.tokens);
      tokenIds.forEach((id) => highlightedTokenIds.add(id));
    }

    // Check remote measurements
    remoteMeasurements.forEach((measurement) => {
      const tokenIds = getTokensInMeasurement(measurement, gameState.tokens);
      tokenIds.forEach((id) => highlightedTokenIds.add(id));
    });

    render(gameState, toolState, selectedTokenId, viewState, remoteMeasurements, highlightedTokenIds);
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
      wsClient.setMapBackground(url);
    } catch (error) {
      console.error('Failed to upload map:', error);
    }
  });

  setOnTokenUpload(async (file: File) => {
    try {
      const url = await uploadImage(file);
      const token: Token = {
        id: crypto.randomUUID(),
        x: 100,
        y: 100,
        width: 50,
        height: 50,
        imageUrl: url,
        name: file.name.replace(/\.[^/.]+$/, ''),
      };
      wsClient.addToken(token);
    } catch (error) {
      console.error('Failed to upload token:', error);
    }
  });

  setOnGridChange((enabled: boolean, size: number) => {
    wsClient.setGrid(enabled, size);
  });

  setOnScaleChange((pixelsPerFoot: number) => {
    wsClient.setMapScale(pixelsPerFoot);
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

    if (toolState.currentTool === 'select') {
      const token = findTokenAtPoint(x, y, gameState.tokens);
      if (token) {
        selectedTokenId = token.id;
        draggedToken = token;
        dragOffsetX = x - token.x;
        dragOffsetY = y - token.y;
        startDrag(toolState, token.x + token.width / 2, token.y + token.height / 2);
      } else {
        selectedTokenId = null;
        draggedToken = null;
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

    if (toolState.isDragging) {
      if (toolState.currentTool === 'select' && draggedToken) {
        updateDrag(toolState, draggedToken.x + draggedToken.width / 2, draggedToken.y + draggedToken.height / 2);
        draggedToken.x = x - dragOffsetX;
        draggedToken.y = y - dragOffsetY;
        updateDrag(toolState, draggedToken.x + draggedToken.width / 2, draggedToken.y + draggedToken.height / 2);
      } else {
        updateDrag(toolState, x, y);

        // Send measurement update to other players (throttled)
        if (toolState.currentTool !== 'select') {
          const now = Date.now();
          if (now - lastMeasurementUpdate >= MEASUREMENT_THROTTLE_MS) {
            lastMeasurementUpdate = now;
            const measurement: Measurement = {
              id: crypto.randomUUID(),
              playerId: playerId,
              tool: toolState.currentTool,
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

    if (toolState.currentTool === 'select' && draggedToken) {
      wsClient.moveToken(draggedToken.id, draggedToken.x, draggedToken.y);
      draggedToken = null;
    } else if (toolState.currentTool !== 'select' && toolState.isDragging) {
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

    const token = findTokenAtPoint(world.x, world.y, gameState.tokens);
    if (token) {
      showContextMenu(e.clientX, e.clientY, token.id);
    } else {
      hideContextMenu();
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
      const gridSize = gameState.map.gridSize;
      const newSize = gridSize * size;

      wsClient.resizeToken(contextMenuTokenId, newSize, newSize);
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

document.addEventListener('DOMContentLoaded', init);
