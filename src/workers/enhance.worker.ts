/// <reference lib="webworker" />
import { processImageDataInBands } from '../core/adjustments';
import { predictEnhancementParams } from '../ml/parameterModel';
import type { EnhancementParams, SubmitOptions, TaskStatus } from '../types';

export interface WorkerRequest {
  type: 'process';
  taskId: string;
  imageData: ImageData;
  options: SubmitOptions;
}

export interface WorkerProgress {
  type: 'progress';
  taskId: string;
  status: TaskStatus;
  progress: number;
  message?: string;
}

export interface WorkerComplete {
  type: 'complete';
  taskId: string;
  blob: Blob;
  params: EnhancementParams;
}

export interface WorkerError {
  type: 'error';
  taskId: string;
  error: string;
}

const cancelled = new Set<string>();

self.onmessage = async (ev: MessageEvent<WorkerRequest | { type: 'cancel'; taskId: string }>) => {
  const msg = ev.data;
  if (msg.type === 'cancel') {
    cancelled.add(msg.taskId);
    return;
  }

  if (msg.type !== 'process') return;

  const { taskId, imageData, options } = msg;

  const postProgress = (status: TaskStatus, progress: number, message?: string) => {
    const payload: WorkerProgress = { type: 'progress', taskId, status, progress, message };
    self.postMessage(payload);
  };

  const checkCancelled = () => {
    if (cancelled.has(taskId)) {
      cancelled.delete(taskId);
      throw new DOMException('Task cancelled', 'AbortError');
    }
  };

  try {
    checkCancelled();
    postProgress('analyzing', 5, 'ML: predicting enhancement parameters');

    const params = await predictEnhancementParams(imageData);
    checkCancelled();

    postProgress('processing', 15, 'Applying brightness, contrast, saturation');

    const bandHeight = Math.max(64, Math.floor(512_000 / imageData.width));
    processImageDataInBands(
      imageData,
      params,
      bandHeight,
      (bandProgress) => {
        postProgress('processing', 15 + bandProgress * 70);
      },
    );

    checkCancelled();
    postProgress('encoding', 90, 'Encoding output image');

    const format = options.outputFormat ?? 'image/jpeg';
    const quality = options.outputQuality ?? 0.92;
    const canvas = new OffscreenCanvas(imageData.width, imageData.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('OffscreenCanvas 2D unavailable');
    ctx.putImageData(imageData, 0, 0);
    const blob = await canvas.convertToBlob({ type: format, quality });

    checkCancelled();
    const result: WorkerComplete = { type: 'complete', taskId, blob, params };
    self.postMessage(result);
    cancelled.delete(taskId);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      const payload: WorkerError = { type: 'error', taskId, error: 'cancelled' };
      self.postMessage(payload);
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    const payload: WorkerError = { type: 'error', taskId, error: message };
    self.postMessage(payload);
  }
};
