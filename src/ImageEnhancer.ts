import { TaskManager } from './core/TaskManager';
import { disposeModel } from './ml/parameterModel';
import EnhanceWorker from './workers/enhance.worker.ts?worker';
import type {
  ImageInput,
  ProgressCallback,
  SubmitOptions,
  TaskStatusInfo,
} from './types';

export interface ImageEnhancerOptions {
  /** Custom worker factory (for non-Vite bundlers). */
  createWorker?: () => Worker;
}

/**
 * Browser module for ML-guided image enhancement (brightness, contrast, saturation).
 *
 * Workflow:
 * 1. {@link submitTask} — enqueue image processing, receive task ID
 * 2. {@link getTaskStatus} or {@link onProgress} — track progress
 * 3. {@link getResult} — download enhanced image
 *
 * {@link cancelTask} aborts an in-flight job.
 */
export class ImageEnhancer {
  private manager: TaskManager;

  constructor(options: ImageEnhancerOptions = {}) {
    this.manager = new TaskManager(
      options.createWorker ?? (() => new EnhanceWorker()),
    );
  }

  /** Subscribe to progress events for all tasks. Returns unsubscribe function. */
  onProgress(callback: ProgressCallback): () => void {
    return this.manager.onProgress(callback);
  }

  /**
   * Submit image for enhancement.
   * @returns Task identifier
   */
  submitTask(image: ImageInput, options?: SubmitOptions): Promise<string> {
    return this.manager.submitTask(image, options);
  }

  /** Current status and progress (0–100) for a task. */
  getTaskStatus(taskId: string): TaskStatusInfo | null {
    return this.manager.getTaskStatus(taskId);
  }

  /** Cancel processing; returns whether cancellation was applied. */
  cancelTask(taskId: string): Promise<boolean> {
    return this.manager.cancelTask(taskId);
  }

  /** Enhanced image blob when status is `completed`, otherwise `null`. */
  getResult(taskId: string): Blob | null {
    return this.manager.getResult(taskId);
  }

  /** ML-predicted parameters used for the completed task. */
  getResultParams(taskId: string): import('./types').EnhancementParams | null {
    return this.manager.getResultParams(taskId);
  }

  dispose(): void {
    this.manager.dispose();
    void disposeModel();
  }
}
