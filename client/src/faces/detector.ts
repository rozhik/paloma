import type { DetectedFaceInput } from '../../../shared/types.js';

/**
 * Names the detector, its models and minimum confidence; sent with every result, so photos are detected again
 * when it changes.
 */
export const DETECTOR = 'face-api-1.7/ssd-mobilenetv1/0.5';
export const MIN_CONFIDENCE = 0.5;

type FaceApi = typeof import('@vladmandic/face-api');

let loading: Promise<FaceApi> | null = null;

/** Loads face-api and its models once, on first use; they are not part of the main bundle. */
export function loadFaceApi(): Promise<FaceApi> {
  loading ??= (async () => {
    const faceapi = await import('@vladmandic/face-api');
    // The bundled TensorFlow.js has these; face-api's typings leave them out
    const tf = faceapi.tf as unknown as { setBackend: (name: string) => Promise<boolean>; ready: () => Promise<void> };
    // WebGL when the browser has it; TensorFlow.js falls back to the CPU otherwise
    await tf.setBackend('webgl').catch(() => false);
    await tf.ready();
    const url = `${import.meta.env.BASE_URL}face-models`;
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(url),
      faceapi.nets.faceLandmark68Net.loadFromUri(url),
      faceapi.nets.faceRecognitionNet.loadFromUri(url),
    ]);
    return faceapi;
  })();
  loading.catch(() => { loading = null; });
  return loading;
}

const clamp = (value: number) => Math.min(Math.max(value, 0), 1);

/** A detection in image pixels as the server stores it: a rectangle as fractions of the image, clipped to it. */
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

/** Loads an image from the server, ready to be read by face-api. */
export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load ${url}`));
    image.src = url;
  });
}

/** Finds the faces on an image with their descriptors. */
export async function detectFaces(image: HTMLImageElement): Promise<DetectedFaceInput[]> {
  const faceapi = await loadFaceApi();
  const results = await faceapi
    .detectAllFaces(image, new faceapi.SsdMobilenetv1Options({ minConfidence: MIN_CONFIDENCE }))
    .withFaceLandmarks()
    .withFaceDescriptors();
  const size = { width: image.naturalWidth, height: image.naturalHeight };
  return results
    .map((result) => toFaceInput(result.detection.box, result.detection.score, result.descriptor, size))
    .filter((face) => face.rect.right > face.rect.left && face.rect.bottom > face.rect.top);
}
