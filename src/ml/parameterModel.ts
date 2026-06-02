import * as tf from '@tensorflow/tfjs';
import type { EnhancementParams } from '../types';

const INPUT_SIZE = 128;
const MODEL_URL = '/models/param-model/model.json';

let model: tf.LayersModel | null = null;
let modelReady: Promise<void> | null = null;

async function ensureModel(): Promise<tf.LayersModel> {
  if (model) return model;
  if (!modelReady) {
    modelReady = (async () => {
      await tf.ready();
      model = await tf.loadLayersModel(MODEL_URL);
      const dummy = tf.zeros([1, INPUT_SIZE, INPUT_SIZE, 3]);
      const out = model.predict(dummy) as tf.Tensor;
      await out.data();
      dummy.dispose();
      out.dispose();
    })();
  }
  await modelReady;
  return model!;
}

function imageDataToTensor(imageData: ImageData): tf.Tensor4D {
  const { width, height } = imageData;
  const canvas = new OffscreenCanvas(INPUT_SIZE, INPUT_SIZE);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('OffscreenCanvas unavailable');
  const temp = new OffscreenCanvas(width, height);
  const tctx = temp.getContext('2d');
  if (!tctx) throw new Error('OffscreenCanvas unavailable');
  tctx.putImageData(imageData, 0, 0);
  ctx.drawImage(temp, 0, 0, INPUT_SIZE, INPUT_SIZE);
  const resized = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);
  const arr = new Float32Array(INPUT_SIZE * INPUT_SIZE * 3);
  const d = resized.data;
  for (let i = 0, j = 0; i < d.length; i += 4, j += 3) {
    arr[j] = d[i] / 255;
    arr[j + 1] = d[i + 1] / 255;
    arr[j + 2] = d[i + 2] / 255;
  }
  return tf.tensor4d(arr, [1, INPUT_SIZE, INPUT_SIZE, 3]);
}

/** Predict enhancement parameters using the trained model only. */
export async function predictEnhancementParams(
  imageData: ImageData,
): Promise<EnhancementParams> {
  const m = await ensureModel();
  const imgTensor = imageDataToTensor(imageData);
  const pred = m.predict(imgTensor) as tf.Tensor;
  const values = await pred.data();
  imgTensor.dispose();
  pred.dispose();

  return {
    brightness: values[0],
    contrast: values[1],
    saturation: values[2],
  };
}

export async function disposeModel(): Promise<void> {
  if (model) {
    model.dispose();
    model = null;
    modelReady = null;
  }
}
