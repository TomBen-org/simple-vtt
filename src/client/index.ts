import { GameState, Token, DEFAULT_GAME_STATE } from '../shared/types.js';
import { wsClient } from './websocket.js';
import { initCanvas, render, loadBackground, getCanvas, resizeCanvas } from './canvas.js';
import { createToolState, setTool, startDrag, updateDrag, endDrag, Tool, ToolState } from './tools.js';
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

let gameState: GameState = { ...DEFAULT_GAME_STATE, tokens: [], map: { ...DEFAULT_GAME_STATE.map } };
let toolState: ToolState = createToolState();
let viewState: ViewState = createViewState();
let selectedTokenId: string | null = null;
let draggedToken: Token | null = null;
let dragOffsetX = 0;
let dragOffsetY = 0;

// Pan tracking
let isRightMouseDown = false;
let hasPanned = false;
const PAN_THRESHOLD = 3;

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
    }
  });

  wsClient.connect();

  function renderLoop(): void {
    render(gameState, toolState, selectedTokenId, viewState);
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
      if (confirm(`Delete token "${token.name || 'Unnamed'}"?`)) {
        wsClient.removeToken(token.id);
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
}

document.addEventListener('DOMContentLoaded', init);
