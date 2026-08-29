import type { FilmOrientation } from "../types";
import { CAPTURE_WEBP_QUALITY } from "../config";

export const FULL_HD = {
  landscape: { width: 1920, height: 1080 },
  portrait: { width: 1080, height: 1920 },
} as const;

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Stomo n’a pas réussi à préparer l’image."));
      },
      type,
      quality,
    );
  });
}

function coverSource(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
) {
  const targetRatio = targetWidth / targetHeight;
  let sx = 0;
  let sy = 0;
  let sw = sourceWidth;
  let sh = sourceHeight;
  if (sourceWidth / sourceHeight > targetRatio) {
    sw = Math.round(sourceHeight * targetRatio);
    sx = Math.round((sourceWidth - sw) / 2);
  } else {
    sh = Math.round(sourceWidth / targetRatio);
    sy = Math.round((sourceHeight - sh) / 2);
  }
  return { sx, sy, sw, sh };
}

function drawCover(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
) {
  const { sx, sy, sw, sh } = coverSource(
    sourceWidth,
    sourceHeight,
    targetWidth,
    targetHeight,
  );
  context.drawImage(source, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight);
}

function thumbnailSize(orientation: FilmOrientation) {
  return orientation === "portrait"
    ? { width: 135, height: 240 }
    : { width: 240, height: 135 };
}

let imageWorker: Worker | null = null;
let workerRequestId = 0;
const workerRequests = new Map<
  number,
  { resolve: (value: unknown) => void; reject: (reason: unknown) => void }
>();

function canUseImageWorker() {
  return (
    typeof Worker === "function" &&
    typeof OffscreenCanvas === "function" &&
    typeof createImageBitmap === "function"
  );
}

function getImageWorker() {
  if (imageWorker) return imageWorker;
  imageWorker = new Worker(new URL("./image-worker.ts", import.meta.url), {
    type: "module",
  });
  imageWorker.onmessage = (
    event: MessageEvent<{ id: number; result?: unknown; error?: string }>,
  ) => {
    const pending = workerRequests.get(event.data.id);
    if (!pending) return;
    workerRequests.delete(event.data.id);
    if (event.data.error) pending.reject(new Error(event.data.error));
    else pending.resolve(event.data.result);
  };
  imageWorker.onerror = () => {
    workerRequests.forEach(({ reject }) =>
      reject(new Error("Le traitement d’image en arrière-plan a échoué.")),
    );
    workerRequests.clear();
    imageWorker?.terminate();
    imageWorker = null;
  };
  return imageWorker;
}

function runWorker<T>(
  request: Record<string, unknown>,
  transfer: Transferable[] = [],
) {
  const id = ++workerRequestId;
  return new Promise<T>((resolve, reject) => {
    workerRequests.set(id, {
      resolve: (value) => resolve(value as T),
      reject,
    });
    getImageWorker().postMessage({ ...request, id }, transfer);
  });
}

export async function captureVideoFrame(
  video: HTMLVideoElement,
  orientation: FilmOrientation = "landscape",
  onSnapshot?: () => void,
) {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (!sourceWidth || !sourceHeight)
    throw new Error("La caméra n’est pas encore prête.");

  let snapshotNotified = false;
  const notifySnapshot = () => {
    if (snapshotNotified) return;
    snapshotNotified = true;
    onSnapshot?.();
  };

  if (canUseImageWorker()) {
    try {
      const bitmap = await createImageBitmap(video);
      notifySnapshot();
      return await runWorker<{
        image: Blob;
        thumbnail: Blob;
        width: number;
        height: number;
        sourceBelowFullHd: boolean;
      }>(
        {
          operation: "capture",
          source: bitmap,
          width: sourceWidth,
          height: sourceHeight,
          orientation,
        },
        [bitmap],
      );
    } catch {
      // Le chemin Canvas classique reste compatible avec Chrome 101.
    }
  }

  const target = FULL_HD[orientation];
  const croppedSource = coverSource(
    sourceWidth,
    sourceHeight,
    target.width,
    target.height,
  );
  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Stomo n’a pas réussi à préparer l’image.");
  drawCover(
    context,
    video,
    sourceWidth,
    sourceHeight,
    target.width,
    target.height,
  );
  notifySnapshot();

  const image = await canvasBlob(canvas, "image/webp", CAPTURE_WEBP_QUALITY);
  const thumbnailTarget = thumbnailSize(orientation);
  canvas.width = thumbnailTarget.width;
  canvas.height = thumbnailTarget.height;
  drawCover(
    canvas.getContext("2d")!,
    video,
    sourceWidth,
    sourceHeight,
    thumbnailTarget.width,
    thumbnailTarget.height,
  );
  const thumbnail = await canvasBlob(canvas, "image/webp", 0.68);
  canvas.width = 1;
  canvas.height = 1;
  return {
    image,
    thumbnail,
    width: target.width,
    height: target.height,
    sourceBelowFullHd:
      croppedSource.sw < target.width || croppedSource.sh < target.height,
  };
}

export function loadBlobImage(blob: Blob) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    if (!(blob instanceof Blob) || blob.size === 0) {
      reject(new Error("Cette image est vide."));
      return;
    }
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Cette image ne peut pas être ouverte."));
    };
    image.src = url;
  });
}

async function drawBlobToCanvas(blob: Blob, width: number, height: number) {
  const image = await loadBlobImage(blob);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Stomo n’a pas réussi à préparer la photo.");
  context.fillStyle = "#000";
  context.fillRect(0, 0, width, height);
  drawCover(
    context,
    image,
    image.naturalWidth,
    image.naturalHeight,
    width,
    height,
  );
  return canvas;
}

export async function imageBlobToJpeg(
  blob: Blob,
  width?: number,
  height?: number,
) {
  if (!width || !height) {
    const image = await loadBlobImage(blob);
    width = image.naturalWidth;
    height = image.naturalHeight;
  }
  if (canUseImageWorker())
    return runWorker<Blob>({
      operation: "jpeg",
      source: blob,
      width,
      height,
      orientation: height > width ? "portrait" : "landscape",
    });
  const canvas = await drawBlobToCanvas(blob, width, height);
  const result = await canvasBlob(canvas, "image/jpeg", 0.92);
  canvas.width = 1;
  canvas.height = 1;
  return result;
}

export async function normalizeImageToWebp(
  blob: Blob,
  width: number,
  height: number,
) {
  if (canUseImageWorker())
    return runWorker<Blob>({
      operation: "webp",
      source: blob,
      width,
      height,
      orientation: height > width ? "portrait" : "landscape",
    });
  const canvas = await drawBlobToCanvas(blob, width, height);
  const result = await canvasBlob(canvas, "image/webp", CAPTURE_WEBP_QUALITY);
  canvas.width = 1;
  canvas.height = 1;
  return result;
}

export async function createThumbnail(
  blob: Blob,
  orientation: FilmOrientation = "landscape",
) {
  const target = thumbnailSize(orientation);
  if (canUseImageWorker())
    return runWorker<Blob>({
      operation: "thumbnail",
      source: blob,
      width: target.width,
      height: target.height,
      orientation,
    });
  const canvas = await drawBlobToCanvas(blob, target.width, target.height);
  const result = await canvasBlob(canvas, "image/webp", 0.68);
  canvas.width = 1;
  canvas.height = 1;
  return result;
}
