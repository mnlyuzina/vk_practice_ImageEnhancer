import heic2any from 'heic2any';
import { MAX_MEGAPIXELS } from '../types';

const SUPPORTED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/bmp',
  'image/x-ms-bmp',
  'image/heic',
  'image/heif',
  'image/heic-sequence',
]);

function detectMime(buffer: ArrayBuffer): string | null {
  const v = new Uint8Array(buffer, 0, Math.min(32, buffer.byteLength));
  if (v[0] === 0xff && v[1] === 0xd8) return 'image/jpeg';
  if (v[0] === 0x89 && v[1] === 0x50 && v[2] === 0x4e && v[3] === 0x47) return 'image/png';
  if (v[0] === 0x42 && v[1] === 0x4d) return 'image/bmp';
  const ftyp =
    String.fromCharCode(v[4], v[5], v[6], v[7]) === 'ftyp' &&
    (String.fromCharCode(v[8], v[9], v[10], v[11]).includes('heic') ||
      String.fromCharCode(v[8], v[9], v[10], v[11]).includes('heif') ||
      String.fromCharCode(v[8], v[9], v[10], v[11]).includes('mif1'));
  if (ftyp) return 'image/heic';
  return null;
}

function assertMegapixelLimit(width: number, height: number): void {
  const mp = (width * height) / 1_000_000;
  if (mp > MAX_MEGAPIXELS) {
    throw new Error(
      `Image exceeds ${MAX_MEGAPIXELS} MP limit (${mp.toFixed(1)} MP, ${width}×${height})`,
    );
  }
}

async function blobToImageBitmap(blob: Blob): Promise<ImageBitmap> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(blob);
  }
  return decodeViaCanvas(blob);
}

async function decodeViaCanvas(blob: Blob): Promise<ImageBitmap> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to decode image'));
      img.src = url;
    });
    assertMegapixelLimit(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D unavailable');
    ctx.drawImage(img, 0, 0);
    return createImageBitmap(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function decodeHeic(buffer: ArrayBuffer): Promise<Blob> {
  const result = await heic2any({
    blob: new Blob([buffer], { type: 'image/heic' }),
    toType: 'image/jpeg',
    quality: 0.92,
  });
  const blobs = Array.isArray(result) ? result : [result];
  return blobs[0] as Blob;
}

export async function normalizeImageInput(
  input: Blob | File | ArrayBuffer | Uint8Array,
): Promise<{ bitmap: ImageBitmap; width: number; height: number }> {
  let buffer: ArrayBuffer;
  let mime: string | undefined;

  if (input instanceof ArrayBuffer) {
    buffer = input;
  } else if (input instanceof Uint8Array) {
    buffer = input.buffer.slice(
      input.byteOffset,
      input.byteOffset + input.byteLength,
    ) as ArrayBuffer;
  } else {
    buffer = await input.arrayBuffer();
    mime = input.type || undefined;
  }

  const detected = mime || detectMime(buffer) || 'image/jpeg';
  if (!SUPPORTED_MIME.has(detected) && !detectMime(buffer)) {
    throw new Error(`Unsupported image format: ${detected || 'unknown'}`);
  }

  let blob: Blob;
  if (detected === 'image/heic' || detected === 'image/heif') {
    blob = await decodeHeic(buffer);
  } else {
    blob = new Blob([buffer], { type: detected });
  }

  const bitmap = await blobToImageBitmap(blob);
  assertMegapixelLimit(bitmap.width, bitmap.height);
  return { bitmap, width: bitmap.width, height: bitmap.height };
}

export async function inputToImageBitmap(
  input: import('../types').ImageInput,
): Promise<ImageBitmap> {
  if (input instanceof ImageBitmap) {
    assertMegapixelLimit(input.width, input.height);
    return input;
  }
  if (input instanceof ImageData) {
    assertMegapixelLimit(input.width, input.height);
    return createImageBitmap(input);
  }
  if (input instanceof HTMLImageElement) {
    assertMegapixelLimit(input.naturalWidth, input.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = input.naturalWidth;
    canvas.height = input.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D unavailable');
    ctx.drawImage(input, 0, 0);
    return createImageBitmap(canvas);
  }
  return (await normalizeImageInput(input)).bitmap;
}

export function imageBitmapToImageData(bitmap: ImageBitmap): ImageData {
  const w = bitmap.width;
  const h = bitmap.height;
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('OffscreenCanvas 2D unavailable');
    ctx.drawImage(bitmap, 0, 0);
    return ctx.getImageData(0, 0, w, h);
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, w, h);
}
