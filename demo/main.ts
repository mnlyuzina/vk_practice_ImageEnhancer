import { ImageEnhancer } from '../src/ImageEnhancer';

const enhancer = new ImageEnhancer();

const fileInput = document.getElementById('file') as HTMLInputElement;
const enhanceBtn = document.getElementById('enhance') as HTMLButtonElement;
const cancelBtn = document.getElementById('cancel') as HTMLButtonElement;
const downloadBtn = document.getElementById('download') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLElement;
const progressWrap = document.querySelector('.progress-wrap') as HTMLElement;
const progressBar = document.getElementById('progress') as HTMLProgressElement;
const progressLabel = document.getElementById('progress-label') as HTMLElement;
const originalImg = document.getElementById('original') as HTMLImageElement;
const resultImg = document.getElementById('result') as HTMLImageElement;
const paramsSection = document.getElementById('params') as HTMLElement;

let currentFile: File | null = null;
let currentTaskId: string | null = null;
let resultObjectUrl: string | null = null;

function setStatus(text: string): void {
  statusEl.textContent = text;
}

function setProgress(value: number): void {
  progressBar.value = value;
  progressLabel.textContent = `${Math.round(value)}%`;
}

function revokeResultUrl(): void {
  if (resultObjectUrl) {
    URL.revokeObjectURL(resultObjectUrl);
    resultObjectUrl = null;
  }
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  currentFile = file;
  originalImg.src = URL.createObjectURL(file);
  resultImg.removeAttribute('src');
  revokeResultUrl();
  enhanceBtn.disabled = false;
  downloadBtn.disabled = true;
  paramsSection.hidden = true;
  setStatus(`Выбрано: ${file.name} (${(file.size / 1024).toFixed(0)} KB)`);
});

enhancer.onProgress(({ taskId, status, progress, message }) => {
  if (taskId !== currentTaskId) return;
  progressWrap.hidden = false;
  setProgress(progress);
  setStatus(message ? `${status}: ${message}` : `Статус: ${status}`);
});

enhanceBtn.addEventListener('click', async () => {
  if (!currentFile) return;

  enhanceBtn.disabled = true;
  cancelBtn.disabled = true;
  downloadBtn.disabled = true;
  paramsSection.hidden = true;
  progressWrap.hidden = false;
  setProgress(0);
  setStatus('Постановка задачи…');

  const started = performance.now();
  const taskId = await enhancer.submitTask(currentFile, {
    outputFormat: 'image/jpeg',
    outputQuality: 0.92,
  });
  currentTaskId = taskId;
  cancelBtn.disabled = false;

  const poll = window.setInterval(() => {
    const info = enhancer.getTaskStatus(taskId);
    if (!info) return;

    if (info.status === 'completed') {
      window.clearInterval(poll);
      const blob = enhancer.getResult(taskId);
      const params = enhancer.getResultParams(taskId);
      const elapsed = ((performance.now() - started) / 1000).toFixed(1);

      if (blob) {
        revokeResultUrl();
        resultObjectUrl = URL.createObjectURL(blob);
        resultImg.src = resultObjectUrl;
        downloadBtn.disabled = false;
      }

      if (params) {
        paramsSection.hidden = false;
        document.getElementById('p-brightness')!.textContent =
          params.brightness.toFixed(3);
        document.getElementById('p-contrast')!.textContent =
          params.contrast.toFixed(3);
        document.getElementById('p-saturation')!.textContent =
          params.saturation.toFixed(3);
      }

      setStatus(`Готово за ${elapsed} с`);
      setProgress(100);
      enhanceBtn.disabled = false;
      cancelBtn.disabled = true;
    } else if (info.status === 'failed' || info.status === 'cancelled') {
      window.clearInterval(poll);
      setStatus(info.error ?? info.status);
      enhanceBtn.disabled = false;
      cancelBtn.disabled = true;
    } else {
      cancelBtn.disabled = false;
    }
  }, 200);
});

cancelBtn.addEventListener('click', async () => {
  if (!currentTaskId) return;
  await enhancer.cancelTask(currentTaskId);
  setStatus('Задача отменена');
  enhanceBtn.disabled = false;
  cancelBtn.disabled = true;
});

downloadBtn.addEventListener('click', () => {
  if (!currentTaskId) return;
  const blob = enhancer.getResult(currentTaskId);
  if (!blob) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `enhanced-${Date.now()}.jpg`;
  a.click();
  URL.revokeObjectURL(a.href);
});
