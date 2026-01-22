import { Tool } from './tools.js';
import { MapSettings } from '../shared/types.js';

type ToolChangeHandler = (tool: Tool) => void;
type MapUploadHandler = (file: File) => void;
type TokenUploadHandler = (file: File) => void;
type GridChangeHandler = (enabled: boolean, size: number) => void;
type SnapChangeHandler = (enabled: boolean) => void;

let onToolChange: ToolChangeHandler | null = null;
let onMapUpload: MapUploadHandler | null = null;
let onTokenUpload: TokenUploadHandler | null = null;
let onGridChange: GridChangeHandler | null = null;
let onSnapChange: SnapChangeHandler | null = null;

export function initUI(): void {
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tool = btn.getAttribute('data-tool') as Tool;
      if (tool && onToolChange) {
        setActiveTool(tool);
        onToolChange(tool);
      }
    });
  });

  const mapInput = document.getElementById('map-input') as HTMLInputElement;
  const mapBtn = document.getElementById('upload-map-btn');
  if (mapBtn && mapInput) {
    mapBtn.addEventListener('click', () => mapInput.click());
    mapInput.addEventListener('change', () => {
      if (mapInput.files?.[0] && onMapUpload) {
        onMapUpload(mapInput.files[0]);
        mapInput.value = '';
      }
    });
  }

  const tokenInput = document.getElementById('token-input') as HTMLInputElement;
  const tokenBtn = document.getElementById('upload-token-btn');
  if (tokenBtn && tokenInput) {
    tokenBtn.addEventListener('click', () => tokenInput.click());
    tokenInput.addEventListener('change', () => {
      if (tokenInput.files?.[0] && onTokenUpload) {
        onTokenUpload(tokenInput.files[0]);
        tokenInput.value = '';
      }
    });
  }

  const gridToggle = document.getElementById('grid-toggle') as HTMLInputElement;
  const gridSizeInput = document.getElementById('grid-size') as HTMLInputElement;
  if (gridToggle) {
    gridToggle.addEventListener('change', () => {
      if (onGridChange) {
        onGridChange(gridToggle.checked, parseInt(gridSizeInput?.value || '50'));
      }
    });
  }
  if (gridSizeInput) {
    gridSizeInput.addEventListener('change', () => {
      if (onGridChange && gridToggle) {
        onGridChange(gridToggle.checked, parseInt(gridSizeInput.value));
      }
    });
  }

  const snapToggle = document.getElementById('snap-toggle') as HTMLInputElement;
  if (snapToggle) {
    snapToggle.addEventListener('change', () => {
      if (onSnapChange) {
        onSnapChange(snapToggle.checked);
      }
    });
  }
}

export function setActiveTool(tool: Tool): void {
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.getAttribute('data-tool') === tool) {
      btn.classList.add('active');
    }
  });
}

export function updateUIFromState(map: MapSettings): void {
  const gridToggle = document.getElementById('grid-toggle') as HTMLInputElement;
  const gridSizeInput = document.getElementById('grid-size') as HTMLInputElement;
  const snapToggle = document.getElementById('snap-toggle') as HTMLInputElement;

  if (gridToggle) gridToggle.checked = map.gridEnabled;
  if (gridSizeInput) gridSizeInput.value = map.gridSize.toString();
  if (snapToggle) snapToggle.checked = map.snapToGrid;
}

export function setOnToolChange(handler: ToolChangeHandler): void {
  onToolChange = handler;
}

export function setOnMapUpload(handler: MapUploadHandler): void {
  onMapUpload = handler;
}

export function setOnTokenUpload(handler: TokenUploadHandler): void {
  onTokenUpload = handler;
}

export function setOnGridChange(handler: GridChangeHandler): void {
  onGridChange = handler;
}

export function setOnSnapChange(handler: SnapChangeHandler): void {
  onSnapChange = handler;
}
