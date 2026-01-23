import { Tool } from './tools.js';
import { MapSettings, Scene, DrawTool } from '../shared/types.js';

type ToolChangeHandler = (tool: Tool) => void;
type MapUploadHandler = (file: File) => void;
type TokenUploadHandler = (file: File) => void;
type GridChangeHandler = (enabled: boolean, size: number, offsetX: number, offsetY: number) => void;
type SnapChangeHandler = (enabled: boolean) => void;
type SceneChangeHandler = (sceneId: string) => void;
type SceneCreateHandler = (name: string) => void;
type SceneDeleteHandler = (sceneId: string) => void;
type SceneRenameHandler = (sceneId: string, name: string) => void;
type DrawModeChangeHandler = (enabled: boolean) => void;
type DrawToolChangeHandler = (tool: DrawTool) => void;
type DrawColorChangeHandler = (color: string) => void;
type DrawBrushSizeChangeHandler = (size: number) => void;
type DrawClearHandler = () => void;
type DrawingOpacityChangeHandler = (opacity: number) => void;
type EraseModeChangeHandler = (enabled: boolean) => void;

let onToolChange: ToolChangeHandler | null = null;
let isMobileMode = false;
let onMapUpload: MapUploadHandler | null = null;
let onTokenUpload: TokenUploadHandler | null = null;
let onGridChange: GridChangeHandler | null = null;
let onSnapChange: SnapChangeHandler | null = null;
let onSceneChange: SceneChangeHandler | null = null;
let onSceneCreate: SceneCreateHandler | null = null;
let onSceneDelete: SceneDeleteHandler | null = null;
let onSceneRename: SceneRenameHandler | null = null;
let onDrawModeChange: DrawModeChangeHandler | null = null;
let onDrawToolChange: DrawToolChangeHandler | null = null;
let onDrawColorChange: DrawColorChangeHandler | null = null;
let onDrawBrushSizeChange: DrawBrushSizeChangeHandler | null = null;
let onDrawClear: DrawClearHandler | null = null;
let onDrawingOpacityChange: DrawingOpacityChangeHandler | null = null;
let onEraseModeChange: EraseModeChangeHandler | null = null;

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

  // Draw section collapse toggle - also controls draw mode
  const drawCollapseBtn = document.getElementById('draw-collapse-btn');
  const drawTools = document.getElementById('draw-tools');
  if (drawCollapseBtn && drawTools) {
    drawCollapseBtn.addEventListener('click', () => {
      const isCollapsed = drawTools.classList.toggle('collapsed');
      drawCollapseBtn.textContent = isCollapsed ? '▶' : '▼';
      const isDrawMode = !isCollapsed;

      // Deselect other tools when entering draw mode
      if (isDrawMode) {
        document.querySelectorAll('.tool-btn').forEach(btn => {
          btn.classList.remove('active');
        });
      }

      if (onDrawModeChange) {
        onDrawModeChange(isDrawMode);
      }
    });
  }

  // Draw tool buttons
  document.querySelectorAll('.draw-tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tool = btn.getAttribute('data-draw-tool') as DrawTool;
      if (tool && onDrawToolChange) {
        setActiveDrawTool(tool);
        onDrawToolChange(tool);
      }
    });
  });

  // Draw color picker
  const drawColorInput = document.getElementById('draw-color') as HTMLInputElement;
  if (drawColorInput) {
    drawColorInput.addEventListener('input', () => {
      if (onDrawColorChange) {
        onDrawColorChange(drawColorInput.value);
      }
    });
  }

  // Brush size slider
  const brushSizeInput = document.getElementById('brush-size') as HTMLInputElement;
  const brushSizeValue = document.getElementById('brush-size-value');
  if (brushSizeInput && brushSizeValue) {
    brushSizeInput.addEventListener('input', () => {
      const size = parseInt(brushSizeInput.value, 10);
      brushSizeValue.textContent = size.toString();
      if (onDrawBrushSizeChange) {
        onDrawBrushSizeChange(size);
      }
    });
  }

  // Draw clear button
  const drawClearBtn = document.getElementById('draw-clear');
  if (drawClearBtn) {
    drawClearBtn.addEventListener('click', () => {
      if (confirm('Clear all drawing on this scene? This cannot be undone.')) {
        if (onDrawClear) {
          onDrawClear();
        }
      }
    });
  }

  // Drawing opacity slider
  const drawingOpacityInput = document.getElementById('drawing-opacity') as HTMLInputElement;
  const drawingOpacityValue = document.getElementById('drawing-opacity-value');
  if (drawingOpacityInput && drawingOpacityValue) {
    drawingOpacityInput.addEventListener('input', () => {
      const value = parseInt(drawingOpacityInput.value, 10);
      drawingOpacityValue.textContent = value + '%';
      if (onDrawingOpacityChange) {
        onDrawingOpacityChange(value / 100);
      }
    });
  }

  // Erase mode checkbox
  const eraseModeToggle = document.getElementById('erase-mode-toggle') as HTMLInputElement;
  if (eraseModeToggle) {
    eraseModeToggle.addEventListener('change', () => {
      if (onEraseModeChange) {
        onEraseModeChange(eraseModeToggle.checked);
      }
    });
  }

  // Mobile toolbar buttons
  document.querySelectorAll('.mobile-tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tool = btn.getAttribute('data-tool') as Tool;
      if (tool && onToolChange) {
        setActiveMobileTool(tool);
        onToolChange(tool);
      }
    });
  });
}

export function setActiveTool(tool: Tool): void {
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.getAttribute('data-tool') === tool) {
      btn.classList.add('active');
    }
  });

  // Close draw tools when selecting a regular tool
  const drawCollapseBtn = document.getElementById('draw-collapse-btn');
  const drawTools = document.getElementById('draw-tools');
  if (drawCollapseBtn && drawTools && !drawTools.classList.contains('collapsed')) {
    drawTools.classList.add('collapsed');
    drawCollapseBtn.textContent = '▶';
    if (onDrawModeChange) {
      onDrawModeChange(false);
    }
  }
}

export function setActiveDrawTool(tool: DrawTool): void {
  document.querySelectorAll('.draw-tool-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.getAttribute('data-draw-tool') === tool) {
      btn.classList.add('active');
    }
  });
}

export function setActiveMobileTool(tool: Tool): void {
  document.querySelectorAll('.mobile-tool-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.getAttribute('data-tool') === tool) {
      btn.classList.add('active');
    }
  });
}

export function setMobileMode(enabled: boolean): void {
  if (isMobileMode === enabled) return;

  isMobileMode = enabled;
  document.body.classList.toggle('mobile-mode', enabled);

  // Reset to appropriate default tool when switching modes
  if (enabled) {
    // Entering mobile mode - set to pan-zoom
    setActiveMobileTool('pan-zoom');
    if (onToolChange) {
      onToolChange('pan-zoom');
    }
  } else {
    // Entering desktop mode - set to move
    setActiveTool('move');
    if (onToolChange) {
      onToolChange('move');
    }
  }
}

export function getIsMobileMode(): boolean {
  return isMobileMode;
}

export function setDrawModeEnabled(enabled: boolean): void {
  const drawCollapseBtn = document.getElementById('draw-collapse-btn');
  const drawTools = document.getElementById('draw-tools');
  if (drawCollapseBtn && drawTools) {
    drawTools.classList.toggle('collapsed', !enabled);
    drawCollapseBtn.textContent = enabled ? '▼' : '▶';
  }
  if (enabled) {
    // Deselect other tools when entering draw mode
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.classList.remove('active');
    });
  }
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

export function setOnDrawModeChange(handler: DrawModeChangeHandler): void {
  onDrawModeChange = handler;
}

export function setOnDrawToolChange(handler: DrawToolChangeHandler): void {
  onDrawToolChange = handler;
}

export function setOnDrawColorChange(handler: DrawColorChangeHandler): void {
  onDrawColorChange = handler;
}

export function setOnDrawBrushSizeChange(handler: DrawBrushSizeChangeHandler): void {
  onDrawBrushSizeChange = handler;
}

export function setOnDrawClear(handler: DrawClearHandler): void {
  onDrawClear = handler;
}

export function setDrawColor(color: string): void {
  const drawColorInput = document.getElementById('draw-color') as HTMLInputElement;
  if (drawColorInput) {
    drawColorInput.value = color;
  }
}

export function setOnDrawingOpacityChange(handler: DrawingOpacityChangeHandler): void {
  onDrawingOpacityChange = handler;
}

export function setOnEraseModeChange(handler: EraseModeChangeHandler): void {
  onEraseModeChange = handler;
}
