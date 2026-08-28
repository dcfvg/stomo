const CAPTURE_ASPECT_RATIO = 16 / 9;

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

export async function captureVideoFrame(video: HTMLVideoElement) {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (!sourceWidth || !sourceHeight)
    throw new Error("La caméra n’est pas encore prête.");

  let sx = 0;
  let sy = 0;
  let sw = sourceWidth;
  let sh = sourceHeight;
  if (sourceWidth / sourceHeight > CAPTURE_ASPECT_RATIO) {
    sw = Math.round(sourceHeight * CAPTURE_ASPECT_RATIO);
    sx = Math.round((sourceWidth - sw) / 2);
  } else {
    sh = Math.round(sourceWidth / CAPTURE_ASPECT_RATIO);
    sy = Math.round((sourceHeight - sh) / 2);
  }

  const width = sw >= 960 ? 1280 : 640;
  const height = width === 1280 ? 720 : 360;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Stomo n’a pas réussi à préparer l’image.");
  context.drawImage(video, sx, sy, sw, sh, 0, 0, width, height);

  const image = await canvasBlob(canvas, "image/webp", 0.86);
  const thumbnailCanvas = document.createElement("canvas");
  thumbnailCanvas.width = 240;
  thumbnailCanvas.height = 135;
  thumbnailCanvas.getContext("2d")?.drawImage(canvas, 0, 0, 240, 135);
  const thumbnail = await canvasBlob(thumbnailCanvas, "image/webp", 0.72);
  return { image, thumbnail, width, height };
}

export function loadBlobImage(blob: Blob) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
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

export async function imageBlobToJpeg(
  blob: Blob,
  width?: number,
  height?: number,
) {
  const image = await loadBlobImage(blob);
  const canvas = document.createElement("canvas");
  canvas.width = width ?? image.naturalWidth;
  canvas.height = height ?? image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Stomo n’a pas réussi à préparer la photo.");
  context.fillStyle = "#000";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvasBlob(canvas, "image/jpeg", 0.92);
}

export async function createThumbnail(blob: Blob) {
  const image = await loadBlobImage(blob);
  const canvas = document.createElement("canvas");
  canvas.width = 240;
  canvas.height = 135;
  canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvasBlob(canvas, "image/webp", 0.72);
}
