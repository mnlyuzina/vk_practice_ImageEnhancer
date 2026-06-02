import type { EnhancementParams } from '../types';

/** Apply brightness, contrast, saturation in sRGB space (0–255). */
export function applyEnhancement(
  data: Uint8ClampedArray,
  params: EnhancementParams,
): void {
  const { brightness, contrast, saturation } = params;
  const bOff = brightness * 40;
  const cFactor = 1 + contrast * 0.8;
  const sFactor = 1 + saturation * 0.9;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    r = r + bOff;
    g = g + bOff;
    b = b + bOff;

    r = (r - 128) * cFactor + 128;
    g = (g - 128) * cFactor + 128;
    b = (b - 128) * cFactor + 128;

    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    r = gray + (r - gray) * sFactor;
    g = gray + (g - gray) * sFactor;
    b = gray + (b - gray) * sFactor;

    data[i] = clampByte(r);
    data[i + 1] = clampByte(g);
    data[i + 2] = clampByte(b);
  }
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

export function processImageDataInBands(
  imageData: ImageData,
  params: EnhancementParams,
  bandHeight: number,
  onBand: (progress: number) => void,
  signal?: AbortSignal,
): void {
  const { width, height } = imageData;
  const totalBands = Math.ceil(height / bandHeight);

  for (let band = 0; band < totalBands; band++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const y0 = band * bandHeight;
    const y1 = Math.min(y0 + bandHeight, height);
    const slice = imageData.data.subarray(
      y0 * width * 4,
      y1 * width * 4,
    );
    applyEnhancement(slice, params);
    onBand((band + 1) / totalBands);
  }
}
