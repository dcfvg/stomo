import type { FrameSummary } from "../types";

const bytes = (...values: number[]) => new Uint8Array(values);

function id(value: number) {
  const result: number[] = [];
  while (value > 0) {
    result.unshift(value & 0xff);
    value >>>= 8;
  }
  return new Uint8Array(result);
}

function size(value: number) {
  for (let length = 1; length <= 8; length += 1) {
    if (value < 2 ** (7 * length) - 1) {
      const result = new Uint8Array(length);
      let remaining = value;
      for (let index = length - 1; index >= 0; index -= 1) {
        result[index] = remaining & 0xff;
        remaining = Math.floor(remaining / 256);
      }
      result[0] |= 1 << (8 - length);
      return result;
    }
  }
  throw new Error("La vidéo est trop grande pour être préparée.");
}

function element(elementId: number, data: Blob | Uint8Array) {
  const asPart = (value: Uint8Array) =>
    value.buffer.slice(
      value.byteOffset,
      value.byteOffset + value.byteLength,
    ) as ArrayBuffer;
  const payload = data instanceof Blob ? data : new Blob([asPart(data)]);
  return new Blob([asPart(id(elementId)), asPart(size(payload.size)), payload]);
}

function uint(value: number) {
  if (value === 0) return bytes(0);
  const result: number[] = [];
  while (value > 0) {
    result.unshift(value & 0xff);
    value = Math.floor(value / 256);
  }
  return new Uint8Array(result);
}

function float64(value: number) {
  const result = new Uint8Array(8);
  new DataView(result.buffer).setFloat64(0, value, false);
  return result;
}

function text(value: string) {
  return new TextEncoder().encode(value);
}

async function extractVp8(webp: Blob) {
  if (webp.size < 20)
    throw new Error("Une photo n’utilise pas le format vidéo attendu.");
  let offset = 12;
  while (offset + 8 <= webp.size) {
    const header = new Uint8Array(
      await webp.slice(offset, offset + 8).arrayBuffer(),
    );
    const name = String.fromCharCode(
      header[0],
      header[1],
      header[2],
      header[3],
    );
    const length =
      header[4] | (header[5] << 8) | (header[6] << 16) | (header[7] << 24);
    if (name === "VP8 ") return webp.slice(offset + 8, offset + 8 + length);
    offset += 8 + length + (length % 2);
  }
  throw new Error("Une photo n’utilise pas le format vidéo attendu.");
}

function simpleBlock(relativeTimecode: number, frame: Blob) {
  const header = bytes(
    0x81,
    (relativeTimecode >> 8) & 0xff,
    relativeTimecode & 0xff,
    0x80,
  );
  return element(0xa3, new Blob([header, frame]));
}

interface PreparedFrame {
  time: number;
  payload: Blob;
}

interface WebmOptions {
  leadIn?: { image: Blob; durationMs: number };
  signal?: AbortSignal;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted)
    throw new DOMException("La préparation a été arrêtée.", "AbortError");
}

function cluster(clusterTime: number, frames: PreparedFrame[]) {
  return element(
    0x1f43b675,
    new Blob([
      element(0xe7, uint(clusterTime)),
      ...frames.map((frame) =>
        simpleBlock(frame.time - clusterTime, frame.payload),
      ),
    ]),
  );
}

export async function framesToWebm<T extends FrameSummary>(
  frames: T[],
  fps: number,
  width: number,
  height: number,
  onProgress?: (current: number, total: number) => void,
  prepareImage: (frame: T) => Promise<Blob> = async (frame) => {
    if ("image" in frame && frame.image instanceof Blob) return frame.image;
    throw new Error("Cette photo est introuvable.");
  },
  options: WebmOptions = {},
) {
  if (!frames.length)
    throw new Error("Prends au moins une photo avant d’enregistrer une vidéo.");
  const frameDuration = 1000 / fps;
  const clusters: Blob[] = [];
  let clusterTime = -1;
  let clusterFrames: PreparedFrame[] = [];
  let outputFrameIndex = 0;

  const appendPayload = (payload: Blob) => {
    const time = Math.round(outputFrameIndex * frameDuration);
    outputFrameIndex += 1;
    if (clusterTime < 0) clusterTime = time;
    if (time - clusterTime >= 1_000 && clusterFrames.length) {
      clusters.push(cluster(clusterTime, clusterFrames));
      clusterTime = time;
      clusterFrames = [];
    }
    clusterFrames.push({ time, payload });
  };

  if (options.leadIn) {
    throwIfAborted(options.signal);
    const titlePayload = await extractVp8(options.leadIn.image);
    const titleFrameCount = Math.max(
      1,
      Math.round(options.leadIn.durationMs / frameDuration),
    );
    for (let index = 0; index < titleFrameCount; index += 1) {
      throwIfAborted(options.signal);
      appendPayload(titlePayload);
    }
  }

  for (let index = 0; index < frames.length; index += 1) {
    throwIfAborted(options.signal);
    const preparedImage = await prepareImage(frames[index]);
    throwIfAborted(options.signal);
    appendPayload(await extractVp8(preparedImage));
    onProgress?.(index + 1, frames.length);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  if (clusterFrames.length) clusters.push(cluster(clusterTime, clusterFrames));

  const ebmlHeader = element(
    0x1a45dfa3,
    new Blob([
      element(0x4286, uint(1)),
      element(0x42f7, uint(1)),
      element(0x42f2, uint(4)),
      element(0x42f3, uint(8)),
      element(0x4282, text("webm")),
      element(0x4287, uint(2)),
      element(0x4285, uint(2)),
    ]),
  );
  const info = element(
    0x1549a966,
    new Blob([
      element(0x2ad7b1, uint(1_000_000)),
      element(0x4489, float64(outputFrameIndex * frameDuration)),
      element(0x4d80, text("Stomo")),
      element(0x5741, text("Stomo")),
    ]),
  );
  const video = element(
    0xe0,
    new Blob([element(0xb0, uint(width)), element(0xba, uint(height))]),
  );
  const trackEntry = element(
    0xae,
    new Blob([
      element(0xd7, uint(1)),
      element(0x73c5, uint(1)),
      element(0x83, uint(1)),
      element(0x86, text("V_VP8")),
      element(0x23e383, uint(Math.round(1_000_000_000 / fps))),
      video,
    ]),
  );
  const segmentPayload = new Blob([
    info,
    element(0x1654ae6b, trackEntry),
    ...clusters,
  ]);
  return new Blob([ebmlHeader, element(0x18538067, segmentPayload)], {
    type: "video/webm",
  });
}
