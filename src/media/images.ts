import type { FilmOrientation } from "../types";

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

export async function captureVideoFrame(
  video: HTMLVideoElement,
  orientation: FilmOrientation = "landscape",
) {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (!sourceWidth || !sourceHeight)
    throw new Error("La caméra n’est pas encore prête.");

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

  const image = await canvasBlob(canvas, "image/webp", 0.84);
  const thumbnailTarget = thumbnailSize(orientation);
  const thumbnailCanvas = document.createElement("canvas");
  thumbnailCanvas.width = thumbnailTarget.width;
  thumbnailCanvas.height = thumbnailTarget.height;
  thumbnailCanvas
    .getContext("2d")
    ?.drawImage(canvas, 0, 0, thumbnailTarget.width, thumbnailTarget.height);
  const thumbnail = await canvasBlob(thumbnailCanvas, "image/webp", 0.72);
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
  return canvasBlob(
    await drawBlobToCanvas(blob, width, height),
    "image/jpeg",
    0.92,
  );
}

export async function normalizeImageToWebp(
  blob: Blob,
  width: number,
  height: number,
) {
  return canvasBlob(
    await drawBlobToCanvas(blob, width, height),
    "image/webp",
    0.84,
  );
}

export async function createThumbnail(
  blob: Blob,
  orientation: FilmOrientation = "landscape",
) {
  const target = thumbnailSize(orientation);
  const canvas = await drawBlobToCanvas(blob, target.width, target.height);
  return canvasBlob(canvas, "image/webp", 0.72);
}
