type FilmOrientation = "landscape" | "portrait";

interface WorkerRequest {
  id: number;
  operation: "capture" | "jpeg" | "webp" | "thumbnail";
  source: Blob | ImageBitmap;
  width: number;
  height: number;
  orientation: FilmOrientation;
}

const FULL_HD = {
  landscape: { width: 1920, height: 1080 },
  portrait: { width: 1080, height: 1920 },
} as const;

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

function draw(
  canvas: OffscreenCanvas,
  source: ImageBitmap,
  width: number,
  height: number,
) {
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Surface d’image indisponible.");
  const crop = coverSource(source.width, source.height, width, height);
  context.fillStyle = "#000";
  context.fillRect(0, 0, width, height);
  context.drawImage(
    source,
    crop.sx,
    crop.sy,
    crop.sw,
    crop.sh,
    0,
    0,
    width,
    height,
  );
  return crop;
}

async function processRequest(request: WorkerRequest) {
  const bitmap =
    request.source instanceof Blob
      ? await createImageBitmap(request.source)
      : request.source;
  const canvas = new OffscreenCanvas(1, 1);
  try {
    if (request.operation === "capture") {
      const target = FULL_HD[request.orientation];
      const crop = draw(canvas, bitmap, target.width, target.height);
      const image = await canvas.convertToBlob({
        type: "image/webp",
        quality: 0.8,
      });
      const thumbnailTarget =
        request.orientation === "portrait"
          ? { width: 135, height: 240 }
          : { width: 240, height: 135 };
      draw(canvas, bitmap, thumbnailTarget.width, thumbnailTarget.height);
      const thumbnail = await canvas.convertToBlob({
        type: "image/webp",
        quality: 0.68,
      });
      return {
        image,
        thumbnail,
        width: target.width,
        height: target.height,
        sourceBelowFullHd: crop.sw < target.width || crop.sh < target.height,
      };
    }

    const target =
      request.operation === "thumbnail"
        ? request.orientation === "portrait"
          ? { width: 135, height: 240 }
          : { width: 240, height: 135 }
        : { width: request.width, height: request.height };
    draw(canvas, bitmap, target.width, target.height);
    if (request.operation === "jpeg")
      return canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 });
    return canvas.convertToBlob({
      type: "image/webp",
      quality: request.operation === "thumbnail" ? 0.68 : 0.8,
    });
  } finally {
    bitmap.close();
    canvas.width = 1;
    canvas.height = 1;
  }
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  void processRequest(request).then(
    (result) => self.postMessage({ id: request.id, result }),
    (error: unknown) =>
      self.postMessage({
        id: request.id,
        error:
          error instanceof Error ? error.message : "Traitement impossible.",
      }),
  );
};

export {};
