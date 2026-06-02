export type TaskStatus =
  | 'queued'
  | 'decoding'
  | 'analyzing'
  | 'processing'
  | 'encoding'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface TaskStatusInfo {
  taskId: string;
  status: TaskStatus;
  progress: number;
  message?: string;
  error?: string;
}

export interface EnhancementParams {
  brightness: number;
  contrast: number;
  saturation: number;
}

export interface SubmitOptions {
  outputFormat?: 'image/jpeg' | 'image/png';
  outputQuality?: number;
}

export type ImageInput =
  | Blob
  | File
  | ArrayBuffer
  | Uint8Array
  | HTMLImageElement
  | ImageBitmap
  | ImageData;

export interface ProgressEvent {
  taskId: string;
  status: TaskStatus;
  progress: number;
  message?: string;
}

export type ProgressCallback = (event: ProgressEvent) => void;

export const MAX_MEGAPIXELS = 15;
export const MAX_PROCESSING_MS = 30_000;
