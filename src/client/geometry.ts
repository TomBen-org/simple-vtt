import { Measurement, Token } from '../shared/types.js';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function lineIntersectsRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rect: Rect
): boolean {
  const left = rect.x;
  const right = rect.x + rect.width;
  const top = rect.y;
  const bottom = rect.y + rect.height;

  // Check if either endpoint is inside the rectangle
  if (pointInRect(x1, y1, rect) || pointInRect(x2, y2, rect)) {
    return true;
  }

  // Check if line intersects any of the 4 rectangle edges
  return (
    lineIntersectsLine(x1, y1, x2, y2, left, top, right, top) ||     // Top edge
    lineIntersectsLine(x1, y1, x2, y2, left, bottom, right, bottom) || // Bottom edge
    lineIntersectsLine(x1, y1, x2, y2, left, top, left, bottom) ||   // Left edge
    lineIntersectsLine(x1, y1, x2, y2, right, top, right, bottom)    // Right edge
  );
}

function pointInRect(x: number, y: number, rect: Rect): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

function lineIntersectsLine(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  x4: number,
  y4: number
): boolean {
  const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
  if (Math.abs(denom) < 0.0001) return false; // Parallel lines

  const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
  const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;

  return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
}

export function circleIntersectsRect(
  cx: number,
  cy: number,
  radius: number,
  rect: Rect
): boolean {
  // Find closest point on rectangle to circle center
  const closestX = Math.max(rect.x, Math.min(cx, rect.x + rect.width));
  const closestY = Math.max(rect.y, Math.min(cy, rect.y + rect.height));

  // Check if distance to closest point is less than radius
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy <= radius * radius;
}

export function coneIntersectsRect(
  cx: number,
  cy: number,
  endX: number,
  endY: number,
  coneAngle: number,
  rect: Rect
): boolean {
  const dx = endX - cx;
  const dy = endY - cy;
  const angle = Math.atan2(dy, dx);
  const length = Math.sqrt(dx * dx + dy * dy);
  const halfAngle = coneAngle / 2;

  // Check if any corner of the rectangle is inside the cone
  const corners = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x, y: rect.y + rect.height },
    { x: rect.x + rect.width, y: rect.y + rect.height },
  ];

  for (const corner of corners) {
    if (pointInCone(corner.x, corner.y, cx, cy, angle, halfAngle, length)) {
      return true;
    }
  }

  // Check if rectangle center is in cone
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  if (pointInCone(centerX, centerY, cx, cy, angle, halfAngle, length)) {
    return true;
  }

  // Check if cone edges intersect rectangle edges
  const edge1EndX = cx + Math.cos(angle - halfAngle) * length;
  const edge1EndY = cy + Math.sin(angle - halfAngle) * length;
  const edge2EndX = cx + Math.cos(angle + halfAngle) * length;
  const edge2EndY = cy + Math.sin(angle + halfAngle) * length;

  if (
    lineIntersectsRect(cx, cy, edge1EndX, edge1EndY, rect) ||
    lineIntersectsRect(cx, cy, edge2EndX, edge2EndY, rect)
  ) {
    return true;
  }

  // Check if arc intersects rectangle (simplified: check if cone origin is in rect)
  if (pointInRect(cx, cy, rect)) {
    return true;
  }

  return false;
}

function pointInCone(
  px: number,
  py: number,
  cx: number,
  cy: number,
  coneAngle: number,
  halfAngle: number,
  length: number
): boolean {
  const dx = px - cx;
  const dy = py - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Check if point is within cone length
  if (dist > length) return false;

  // Check if point is within cone angle
  const pointAngle = Math.atan2(dy, dx);
  let angleDiff = pointAngle - coneAngle;

  // Normalize angle difference to [-PI, PI]
  while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
  while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

  return Math.abs(angleDiff) <= halfAngle;
}

export function rectIntersectsRect(rect1: Rect, rect2: Rect): boolean {
  return (
    rect1.x < rect2.x + rect2.width &&
    rect1.x + rect1.width > rect2.x &&
    rect1.y < rect2.y + rect2.height &&
    rect1.y + rect1.height > rect2.y
  );
}

export function getTokensInMeasurement(
  measurement: Measurement,
  tokens: Token[],
  gridSize: number
): string[] {
  const result: string[] = [];

  for (const token of tokens) {
    // Calculate pixel dimensions from grid units
    const rect: Rect = {
      x: token.x,
      y: token.y,
      width: token.gridWidth * gridSize,
      height: token.gridHeight * gridSize,
    };

    let intersects = false;

    switch (measurement.tool) {
      case 'line':
        intersects = lineIntersectsRect(
          measurement.startX,
          measurement.startY,
          measurement.endX,
          measurement.endY,
          rect
        );
        break;

      case 'circle':
        const radius = Math.sqrt(
          Math.pow(measurement.endX - measurement.startX, 2) +
            Math.pow(measurement.endY - measurement.startY, 2)
        );
        intersects = circleIntersectsRect(
          measurement.startX,
          measurement.startY,
          radius,
          rect
        );
        break;

      case 'cone':
        const coneAngle = Math.PI / 3; // 60 degrees
        intersects = coneIntersectsRect(
          measurement.startX,
          measurement.startY,
          measurement.endX,
          measurement.endY,
          coneAngle,
          rect
        );
        break;

      case 'cube':
        const cdx = measurement.endX - measurement.startX;
        const cdy = measurement.endY - measurement.startY;
        const side = Math.max(Math.abs(cdx), Math.abs(cdy));
        const cubeRect: Rect = {
          x: cdx >= 0 ? measurement.startX : measurement.startX - side,
          y: cdy >= 0 ? measurement.startY : measurement.startY - side,
          width: side,
          height: side,
        };
        intersects = rectIntersectsRect(cubeRect, rect);
        break;
    }

    if (intersects) {
      result.push(token.id);
    }
  }

  return result;
}
