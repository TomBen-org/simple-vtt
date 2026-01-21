import { Token } from '../shared/types.js';

const tokenImages: Map<string, HTMLImageElement> = new Map();

export function loadTokenImage(token: Token): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const existing = tokenImages.get(token.imageUrl);
    if (existing && existing.complete) {
      resolve(existing);
      return;
    }

    const img = new Image();
    img.onload = () => {
      tokenImages.set(token.imageUrl, img);
      resolve(img);
    };
    img.onerror = reject;
    img.src = token.imageUrl;
  });
}

export function getTokenImage(imageUrl: string): HTMLImageElement | undefined {
  return tokenImages.get(imageUrl);
}

export function isPointInToken(x: number, y: number, token: Token): boolean {
  return (
    x >= token.x &&
    x <= token.x + token.width &&
    y >= token.y &&
    y <= token.y + token.height
  );
}

export function findTokenAtPoint(x: number, y: number, tokens: Token[]): Token | null {
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (isPointInToken(x, y, tokens[i])) {
      return tokens[i];
    }
  }
  return null;
}

export async function uploadImage(file: File): Promise<string> {
  const response = await fetch('/api/upload', {
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
