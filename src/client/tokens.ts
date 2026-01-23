import { Token } from '../shared/types.js';
import { generateMipmaps, selectMipmap } from './mipmaps.js';

const tokenMipmaps: Map<string, HTMLCanvasElement[]> = new Map();

export function loadTokenImage(token: Token): Promise<HTMLCanvasElement[]> {
  return new Promise((resolve, reject) => {
    const existing = tokenMipmaps.get(token.imageUrl);
    if (existing) {
      resolve(existing);
      return;
    }

    const img = new Image();
    img.onload = () => {
      const mipmaps = generateMipmaps(img);
      tokenMipmaps.set(token.imageUrl, mipmaps);
      resolve(mipmaps);
    };
    img.onerror = reject;
    img.src = token.imageUrl;
  });
}

export function getTokenImage(imageUrl: string): HTMLCanvasElement | undefined {
  const mipmaps = tokenMipmaps.get(imageUrl);
  return mipmaps ? mipmaps[0] : undefined;
}

export function getTokenMipmap(imageUrl: string, targetWidth: number, targetHeight: number): HTMLCanvasElement | undefined {
  const mipmaps = tokenMipmaps.get(imageUrl);
  if (!mipmaps) return undefined;
  return selectMipmap(mipmaps, targetWidth, targetHeight);
}

export function isPointInToken(x: number, y: number, token: Token, gridSize: number): boolean {
  const width = token.gridWidth * gridSize;
  const height = token.gridHeight * gridSize;
  return (
    x >= token.x &&
    x <= token.x + width &&
    y >= token.y &&
    y <= token.y + height
  );
}

export function findTokenAtPoint(x: number, y: number, tokens: Token[], gridSize: number): Token | null {
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (isPointInToken(x, y, tokens[i], gridSize)) {
      return tokens[i];
    }
  }
  return null;
}

export async function uploadImage(file: File): Promise<string> {
  const response = await fetch('api/upload', {
    method: 'POST',
    body: file,
    headers: {
      'Content-Type': file.type,
    },
  });

  if (!response.ok) {
    throw new Error('Upload failed');
  }

  const data = await response.json();
  return data.url;
}
