import path from 'node:path';
import sharp from 'sharp';
import type { DetectedFaceInput } from '../../../shared/types.js';

/**
 * Names the detector, its models and minimum confidence; stored with every result, so photos are detected again
 * when it changes. The same as the browser detector used before, so its results still count.
 */
export const DETECTOR = 'face-api-1.7/ssd-mobilenetv1/0.5';
export const MIN_CONFIDENCE = 0.5;

type FaceApi = typeof import('@vladmandic/face-api');

/** Finds faces on an image file; replaced in tests. */
export interface FaceDetector {
  /** Loads the detector; a failure ends the task before any photo */
  prepare(): Promise<void>;
  detect(imagePath: string): Promise<DetectedFaceInput[]>;
}

let loading: Promise<FaceApi> | null = null;

/**
 * Loads face-api with TensorFlow.js on WebAssembly (no native build) and its models from the package, once, on
 * first use.
 */
function loadFaceApi(): Promise<FaceApi> {
  loading ??= (async () => {
    // The WebAssembly build of face-api uses @tensorflow/tfjs with its wasm backend
    const faceapi = require('@vladmandic/face-api/dist/face-api.node-wasm.js') as FaceApi;
    const tf = faceapi.tf as unknown as { setBackend: (name: string) => Promise<boolean>; ready: () => Promise<void> };
    await tf.setBackend('wasm');
    await tf.ready();
    const modelDir = path.join(path.dirname(require.resolve('@vladmandic/face-api/package.json')), 'model');
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromDisk(modelDir),
      faceapi.nets.faceLandmark68Net.loadFromDisk(modelDir),
      faceapi.nets.faceRecognitionNet.loadFromDisk(modelDir),
    ]);
    return faceapi;
  })();
  loading.catch(() => { loading = null; });
  return loading;
}

const clamp = (value: number) => Math.min(Math.max(value, 0), 1);

/** A detection in image pixels as the library stores it: a rectangle as fractions of the image, clipped to it. */
export function toFaceInput(
  box: { x: number; y: number; width: number; height: number },
  score: number,
  descriptor: ArrayLike<number>,
  image: { width: number; height: number },
): DetectedFaceInput {
  return {
    rect: {
      left: clamp(box.x / image.width),
      top: clamp(box.y / image.height),
      right: clamp((box.x + box.width) / image.width),
      bottom: clamp((box.y + box.height) / image.height),
    },
    score: clamp(score),
    descriptor: Array.from(descriptor),
  };
}

/** Finds the faces on an image file (the photo's face source, upright) with their descriptors. */
async function detectFaces(imagePath: string): Promise<DetectedFaceInput[]> {
  const faceapi = await loadFaceApi();
  const { data, info } = await sharp(imagePath).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const tensor = faceapi.tf.tensor3d(new Int32Array(data), [info.height, info.width, 3], 'int32');
  try {
    const results = await faceapi
      .detectAllFaces(tensor as unknown as Parameters<FaceApi['detectAllFaces']>[0], new faceapi.SsdMobilenetv1Options({ minConfidence: MIN_CONFIDENCE }))
      .withFaceLandmarks()
      .withFaceDescriptors();
    const size = { width: info.width, height: info.height };
    return results
      .map((result: { detection: { box: { x: number; y: number; width: number; height: number }; score: number }; descriptor: Float32Array }) => toFaceInput(result.detection.box, result.detection.score, result.descriptor, size))
      .filter((face: DetectedFaceInput) => face.rect.right > face.rect.left && face.rect.bottom > face.rect.top);
  } finally {
    tensor.dispose();
  }
}

export const faceDetector: FaceDetector = {
  prepare: async () => { await loadFaceApi(); },
  detect: detectFaces,
};
