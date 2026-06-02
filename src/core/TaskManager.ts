import type {
  ImageInput,
  ProgressCallback,
  SubmitOptions,
  TaskStatus,
  TaskStatusInfo,
} from '../types';
import { MAX_PROCESSING_MS } from '../types';
import { inputToImageBitmap, imageBitmapToImageData } from '../utils/imageDecode';
import EnhanceWorker from '../workers/enhance.worker.ts?worker';
import type {
  WorkerComplete,
  WorkerError,
  WorkerProgress,
  WorkerRequest,
} from '../workers/enhance.worker';

interface TaskRecord {
  status: TaskStatus;
  progress: number;
  message?: string;
  error?: string;
  result?: Blob;
  params?: import('../types').EnhancementParams;
  abortController: AbortController;
  timeoutId?: ReturnType<typeof setTimeout>;
}

export class TaskManager {
  private tasks = new Map<string, TaskRecord>();
  private worker: Worker | null = null;
  private progressListeners = new Set<ProgressCallback>();

  constructor(
    private workerFactory: () => Worker = () => new EnhanceWorker(),
  ) {}

  onProgress(callback: ProgressCallback): () => void {
    this.progressListeners.add(callback);
    return () => this.progressListeners.delete(callback);
  }

  private emitProgress(
    taskId: string,
    status: TaskStatus,
    progress: number,
    message?: string,
  ): void {
    for (const cb of this.progressListeners) {
      cb({ taskId, status, progress, message });
    }
  }

  private getWorker(): Worker {
    if (!this.worker) {
      this.worker = this.workerFactory();
      this.worker.onmessage = (ev) => this.handleWorkerMessage(ev.data);
      this.worker.onerror = (ev) => {
        console.error('Enhance worker error:', ev.message);
      };
    }
    return this.worker;
  }

  private handleWorkerMessage(
    data: WorkerProgress | WorkerComplete | WorkerError,
  ): void {
    const task = this.tasks.get(data.taskId);
    if (!task) return;

    if (data.type === 'progress') {
      task.status = data.status;
      task.progress = data.progress;
      task.message = data.message;
      this.emitProgress(data.taskId, data.status, data.progress, data.message);
      return;
    }

    if (data.type === 'complete') {
      clearTimeout(task.timeoutId);
      task.status = 'completed';
      task.progress = 100;
      task.result = data.blob;
      task.params = data.params;
      this.emitProgress(data.taskId, 'completed', 100);
      return;
    }

    if (data.type === 'error') {
      clearTimeout(task.timeoutId);
      if (data.error === 'cancelled') {
        task.status = 'cancelled';
        task.error = 'cancelled';
        this.emitProgress(data.taskId, 'cancelled', task.progress);
      } else {
        task.status = 'failed';
        task.error = data.error;
        this.emitProgress(data.taskId, 'failed', task.progress);
      }
    }
  }

  async submitTask(
    image: ImageInput,
    options: SubmitOptions = {},
  ): Promise<string> {
    const taskId = crypto.randomUUID();
    const abortController = new AbortController();
    const record: TaskRecord = {
      status: 'queued',
      progress: 0,
      abortController,
    };
    this.tasks.set(taskId, record);
    this.emitProgress(taskId, 'queued', 0);

    record.timeoutId = setTimeout(() => {
      if (record.status !== 'completed' && record.status !== 'cancelled') {
        void this.cancelTask(taskId);
        record.status = 'failed';
        record.error = `Processing exceeded ${MAX_PROCESSING_MS / 1000}s limit`;
        this.emitProgress(taskId, 'failed', record.progress, record.error);
      }
    }, MAX_PROCESSING_MS);

    void this.runTask(taskId, image, options, abortController.signal);
    return taskId;
  }

  private async runTask(
    taskId: string,
    image: ImageInput,
    options: SubmitOptions,
    signal: AbortSignal,
  ): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;

    try {
      task.status = 'decoding';
      task.progress = 2;
      this.emitProgress(taskId, 'decoding', 2, 'Decoding image');

      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

      const bitmap = await inputToImageBitmap(image);
      const imageData = imageBitmapToImageData(bitmap);
      bitmap.close();

      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

      const worker = this.getWorker();
      const request: WorkerRequest = {
        type: 'process',
        taskId,
        imageData,
        options,
      };
      worker.postMessage(request, [imageData.data.buffer]);
    } catch (err) {
      clearTimeout(task.timeoutId);
      task.status = 'failed';
      task.error = err instanceof Error ? err.message : String(err);
      this.emitProgress(taskId, 'failed', task.progress, task.error);
    }
  }

  getTaskStatus(taskId: string): TaskStatusInfo | null {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    return {
      taskId,
      status: task.status,
      progress: Math.round(task.progress),
      message: task.message,
      error: task.error,
    };
  }

  async cancelTask(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    if (
      task.status === 'completed' ||
      task.status === 'cancelled' ||
      task.status === 'failed'
    ) {
      return task.status === 'cancelled';
    }

    task.abortController.abort();
    this.getWorker().postMessage({ type: 'cancel', taskId });
    task.status = 'cancelled';
    task.error = 'cancelled';
    clearTimeout(task.timeoutId);
    this.emitProgress(taskId, 'cancelled', task.progress);
    return true;
  }

  getResult(taskId: string): Blob | null {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'completed') return null;
    return task.result ?? null;
  }

  getResultParams(taskId: string): import('../types').EnhancementParams | null {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'completed') return null;
    return task.params ?? null;
  }

  dispose(): void {
    for (const id of this.tasks.keys()) {
      void this.cancelTask(id);
    }
    this.worker?.terminate();
    this.worker = null;
    this.tasks.clear();
    this.progressListeners.clear();
  }
}
