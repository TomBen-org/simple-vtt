/**
 * Mipmap generation and selection utilities for high-quality image downscaling.
 * Pre-generates a chain of progressively smaller versions of each image.
 * When drawing, select the mipmap level closest to (but larger than) the final
 * display size, letting the canvas do only a small final interpolation.
 */

export function generateMipmaps(img: HTMLImageElement): HTMLCanvasElement[] {
  const mipmaps: HTMLCanvasElement[] = [];
  let width = img.naturalWidth;
  let height = img.naturalHeight;

  // Level 0: original size
  let canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  let ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  mipmaps.push(canvas);

  // Generate smaller levels by halving each time
  while (width > 4 && height > 4) {
    const prevCanvas = mipmaps[mipmaps.length - 1];
    width = Math.ceil(width / 2);
    height = Math.ceil(height / 2);

    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    ctx = canvas.getContext('2d')!;
    ctx.drawImage(prevCanvas, 0, 0, width, height);
    mipmaps.push(canvas);
  }

  return mipmaps;
}

export function selectMipmap(mipmaps: HTMLCanvasElement[], targetWidth: number, targetHeight: number): HTMLCanvasElement {
  // Find the smallest mipmap that's still >= target size
  for (let i = mipmaps.length - 1; i >= 0; i--) {
    if (mipmaps[i].width >= targetWidth && mipmaps[i].height >= targetHeight) {
      return mipmaps[i];
    }
  }
  // Return largest (original) if target is bigger than all mipmaps (zoomed in)
  return mipmaps[0];
}
