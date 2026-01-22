import { Tool } from './tools.js';
import { MapSettings, Scene } from '../shared/types.js';

type ToolChangeHandler = (tool: Tool) => void;
type MapUploadHandler = (file: File) => void;
type TokenUploadHandler = (file: File) => void;
type GridChangeHandler = (enabled: boolean, size: number, offsetX: number, offsetY: number) => void;
type SnapChangeHandler = (enabled: boolean) => void;
type SceneChangeHandler = (sceneId: string) => void;
type SceneCreateHandler = (name: string) => void;
type SceneDeleteHandler = (sceneId: string) => void;
type SceneRenameHandler = (sceneId: string, name: string) => void;

let onToolChange: ToolChangeHandler | null = null;
let onMapUpload: MapUploadHandler | null = null;
let onTokenUpload: TokenUploadHandler | null = null;
let onGridChange: GridChangeHandler | null = null;
let onSnapChange: SnapChangeHandler | null = null;
let onSceneChange: SceneChangeHandler | null = null;
let onSceneCreate: SceneCreateHandler | null = null;
let onSceneDelete: SceneDeleteHandler | null = null;
let onSceneRename: SceneRenameHandler | null = null;

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
  const gridOffsetXInput = document.getElementById('grid-offset-x') as HTMLInputElement;
  const gridOffsetYInput = document.getElementById('grid-offset-y') as HTMLInputElement;

  function triggerGridChange(): void {
    if (onGridChange && gridToggle && gridSizeInput && gridOffsetXInput && gridOffsetYInput) {
      onGridChange(
        gridToggle.checked,
        parseFloat(gridSizeInput.value) || 50,
        parseFloat(gridOffsetXInput.value) || 0,
        parseFloat(gridOffsetYInput.value) || 0
      );
    }
  }

  if (gridToggle) {
    gridToggle.addEventListener('change', triggerGridChange);
  }
  if (gridSizeInput) {
    gridSizeInput.addEventListener('change', triggerGridChange);
  }
  if (gridOffsetXInput) {
    gridOffsetXInput.addEventListener('change', triggerGridChange);
  }
  if (gridOffsetYInput) {
    gridOffsetYInput.addEventListener('change', triggerGridChange);
  }

  // Grid size +/- buttons
  const gridSizeInc = document.getElementById('grid-size-inc');
  const gridSizeDec = document.getElementById('grid-size-dec');
  if (gridSizeInc && gridSizeInput) {
    gridSizeInc.addEventListener('click', () => {
      gridSizeInput.value = String((parseFloat(gridSizeInput.value) || 50) + 1);
      triggerGridChange();
    });
  }
  if (gridSizeDec && gridSizeInput) {
    gridSizeDec.addEventListener('click', () => {
      const newValue = (parseFloat(gridSizeInput.value) || 50) - 1;
      gridSizeInput.value = String(Math.max(1, newValue));
      triggerGridChange();
    });
  }

  // Grid offset X +/- buttons
  const gridOffsetXInc = document.getElementById('grid-offset-x-inc');
  const gridOffsetXDec = document.getElementById('grid-offset-x-dec');
  if (gridOffsetXInc && gridOffsetXInput) {
    gridOffsetXInc.addEventListener('click', () => {
      gridOffsetXInput.value = String((parseFloat(gridOffsetXInput.value) || 0) + 1);
      triggerGridChange();
    });
  }
  if (gridOffsetXDec && gridOffsetXInput) {
    gridOffsetXDec.addEventListener('click', () => {
      gridOffsetXInput.value = String((parseFloat(gridOffsetXInput.value) || 0) - 1);
      triggerGridChange();
    });
  }

  // Grid offset Y +/- buttons
  const gridOffsetYInc = document.getElementById('grid-offset-y-inc');
  const gridOffsetYDec = document.getElementById('grid-offset-y-dec');
  if (gridOffsetYInc && gridOffsetYInput) {
    gridOffsetYInc.addEventListener('click', () => {
      gridOffsetYInput.value = String((parseFloat(gridOffsetYInput.value) || 0) + 1);
      triggerGridChange();
    });
  }
  if (gridOffsetYDec && gridOffsetYInput) {
    gridOffsetYDec.addEventListener('click', () => {
      gridOffsetYInput.value = String((parseFloat(gridOffsetYInput.value) || 0) - 1);
      triggerGridChange();
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

  // Grid section collapse toggle
  const collapseBtn = document.getElementById('grid-collapse-btn');
  const gridSettings = document.getElementById('grid-settings');
  if (collapseBtn && gridSettings) {
    collapseBtn.addEventListener('click', () => {
      const isCollapsed = gridSettings.classList.toggle('collapsed');
      collapseBtn.textContent = isCollapsed ? '▶' : '▼';
    });
  }

  // Scene selector
  const sceneSelect = document.getElementById('scene-select') as HTMLSelectElement;
  if (sceneSelect) {
    sceneSelect.addEventListener('change', () => {
      if (onSceneChange) {
        onSceneChange(sceneSelect.value);
      }
    });
  }

  const sceneAddBtn = document.getElementById('scene-add');
  if (sceneAddBtn) {
    sceneAddBtn.addEventListener('click', () => {
      const name = prompt('Enter scene name:');
      if (name && onSceneCreate) {
        onSceneCreate(name);
      }
    });
  }

  const sceneDeleteBtn = document.getElementById('scene-delete');
  if (sceneDeleteBtn) {
    sceneDeleteBtn.addEventListener('click', () => {
      if (sceneSelect && onSceneDelete) {
        if (confirm('Delete this scene? This cannot be undone.')) {
          onSceneDelete(sceneSelect.value);
        }
      }
    });
  }

  const sceneRenameBtn = document.getElementById('scene-rename');
  if (sceneRenameBtn) {
    sceneRenameBtn.addEventListener('click', () => {
      if (sceneSelect && onSceneRename) {
        const currentOption = sceneSelect.options[sceneSelect.selectedIndex];
        const name = prompt('Enter new scene name:', currentOption?.textContent || '');
        if (name) {
          onSceneRename(sceneSelect.value, name);
        }
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
  const gridOffsetXInput = document.getElementById('grid-offset-x') as HTMLInputElement;
  const gridOffsetYInput = document.getElementById('grid-offset-y') as HTMLInputElement;

  if (gridToggle) gridToggle.checked = map.gridEnabled;
  if (gridSizeInput) gridSizeInput.value = map.gridSize.toString();
  if (gridOffsetXInput) gridOffsetXInput.value = (map.gridOffsetX || 0).toString();
  if (gridOffsetYInput) gridOffsetYInput.value = (map.gridOffsetY || 0).toString();
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

export function setOnSceneChange(handler: SceneChangeHandler): void {
  onSceneChange = handler;
}

export function setOnSceneCreate(handler: SceneCreateHandler): void {
  onSceneCreate = handler;
}

export function setOnSceneDelete(handler: SceneDeleteHandler): void {
  onSceneDelete = handler;
}

export function setOnSceneRename(handler: SceneRenameHandler): void {
  onSceneRename = handler;
}

export function updateSceneSelector(scenes: Scene[], activeSceneId: string): void {
  const sceneSelect = document.getElementById('scene-select') as HTMLSelectElement;
  if (!sceneSelect) return;

  // Remember current selection
  const previousValue = sceneSelect.value;

  // Clear and repopulate
  sceneSelect.innerHTML = '';
  scenes.forEach(scene => {
    const option = document.createElement('option');
    option.value = scene.id;
    option.textContent = scene.name;
    sceneSelect.appendChild(option);
  });

  // Set the active scene
  sceneSelect.value = activeSceneId;

  // Disable delete button if only one scene
  const deleteBtn = document.getElementById('scene-delete') as HTMLButtonElement;
  if (deleteBtn) {
    deleteBtn.disabled = scenes.length <= 1;
  }
}
