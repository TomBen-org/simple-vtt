---
layout: default
title: User Guide
---

<p align="center" style="margin-bottom: 2em;">
  <a href="./" style="display: inline-block; padding: 0.75em 1.5em; margin: 0.25em; background-color: #159957; color: white; text-decoration: none; border-radius: 0.5em; font-weight: bold;">Home</a>
  <a href="hosting" style="display: inline-block; padding: 0.75em 1.5em; margin: 0.25em; background-color: #159957; color: white; text-decoration: none; border-radius: 0.5em; font-weight: bold;">Hosting Guide</a>
</p>

# User Guide

This guide covers everything you need to know to use Simple VTT as a player or game master.

## Interface Overview

The main interface consists of:
- **Canvas** - The main play area showing the map, grid, and tokens
- **Toolbar** - Tools for interacting with the canvas (left side)
- **Settings Panels** - Collapsible panels for tokens, maps, grid, and scenes (right side)

## Navigation

### Pan and Zoom
- **Pan**: Hold the right mouse button and drag to move around the map
- **Zoom**: Use the scroll wheel to zoom in and out

## Tokens

### Adding Tokens
There are two ways to add tokens:

1. **Upload Panel**: Use the "Tokens" section in the right panel to upload PNG images
2. **Drag and Drop**: Drag image files (PNG, JPEG, GIF, WebP) directly onto the canvas
   - Single files create a token at the drop position
   - Multiple files are arranged in a grid pattern

### Moving Tokens
1. Select the **Move** tool from the toolbar (or press the default key)
2. Click on a token to select it
3. Drag to move - a distance indicator shows how far you're moving (in feet)

### Token Sizes
Tokens are measured in grid units:
- **1x1** - Standard medium creature (default)
- **2x2** - Large creature
- **3x3** - Huge creature
- **4x4** - Gargantuan creature

To resize a token, right-click it and select a new size from the context menu.

### Deleting Tokens
Right-click a token and select **Delete** from the context menu.

## Maps

### Uploading a Map
1. Open the **Map** section in the right panel
2. Click **Upload Map** and select an image file
3. Choose whether to:
   - **Replace current background** - Updates the current scene's map
   - **Create new scene** - Creates a new scene with this map

## Grid

### Showing/Hiding the Grid
Toggle the grid visibility in the **Grid** section of the settings panel.

### Configuring Grid Size
You can adjust the grid cell size manually using the +/- buttons or by entering a value directly.

### Grid Alignment Tool
For precise grid alignment with your map:

1. Click the **Align** button in the Grid section
2. Draw a box over several grid cells on your map (the more cells, the more accurate)
3. Enter the number of cells along the longest side of your selection
4. The grid will automatically adjust size and offset to match your map

### Snap to Grid
Toggle snap-to-grid using the checkbox next to the Move tool. When enabled, tokens will snap to grid intersections when moved.

**Tip**: Hold **Ctrl** while dragging to temporarily invert the snap setting.

## Measurement Tools

All measurements are visible to all connected players. Your measurements appear in yellow, other players' measurements appear in purple.

### Line Measurement
1. Select the **Line** tool
2. Click and drag to measure distance between two points
3. Distance is displayed in feet (1 grid cell = 5 feet)

### Circle Measurement
1. Select the **Circle** tool
2. Click to set the center point
3. Drag outward to set the radius
4. Useful for area-of-effect spells with a radius

### Cone Measurement
1. Select the **Cone** tool
2. Click to set the origin point
3. Drag to set the direction and length
4. Creates a 60-degree cone (standard for most RPG cone effects)

### Token Highlighting
Tokens that are touched by any measurement will glow orange, making it easy to see who's affected by an area of effect.

## Scenes

Simple VTT supports multiple scenes, allowing you to prepare different maps and encounters.

### Switching Scenes
Use the scene dropdown in the **Scenes** section to switch between scenes. All connected players will switch to the new scene together.

### Creating Scenes
- Click the **+** button next to the scene dropdown, or
- Upload a new map and choose "Create new scene"

### Renaming Scenes
Click the **Rename** button and enter a new name for the current scene.

### Deleting Scenes
Click the **Delete** button to remove the current scene. You cannot delete the last remaining scene.

## Multiplayer

### Connecting
Simply open the same URL in multiple browsers or share the URL with your players. Everyone connects automatically - no login or room codes required.

### What Syncs
- Token positions and sizes
- Map/background images
- Grid settings (visibility, size, offset)
- Active measurements
- Scene changes

### What Doesn't Sync
- Snap-to-grid preference (each player controls their own)
- Viewport position and zoom (each player has their own view)
