import type { FrameRecord } from "../types";

const bytes = (...values: number[]) => new Uint8Array(values);

function concat(parts: Uint8Array[]) {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  parts.forEach((part) => {
    result.set(part, offset);
    offset += part.length;
  });
  return result;
}

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

function element(elementId: number, data: Uint8Array) {
  return concat([id(elementId), size(data.length), data]);
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

function extractVp8(webp: Uint8Array) {
  for (let offset = 12; offset + 8 <= webp.length; ) {
    const name = String.fromCharCode(
      webp[offset],
      webp[offset + 1],
      webp[offset + 2],
      webp[offset + 3],
    );
    const length =
      webp[offset + 4] |
      (webp[offset + 5] << 8) |
      (webp[offset + 6] << 16) |
      (webp[offset + 7] << 24);
    if (name === "VP8 ") return webp.slice(offset + 8, offset + 8 + length);
    offset += 8 + length + (length % 2);
  }
  throw new Error("Une photo n’utilise pas le format vidéo attendu.");
}

function simpleBlock(relativeTimecode: number, frame: Uint8Array) {
  const header = bytes(
    0x81,
    (relativeTimecode >> 8) & 0xff,
    relativeTimecode & 0xff,
    0x80,
  );
  return element(0xa3, concat([header, frame]));
}

export async function framesToWebm(
  frames: FrameRecord[],
  fps: number,
  width: number,
  height: number,
  onProgress?: (current: number, total: number) => void,
) {
  if (!frames.length)
    throw new Error("Prends au moins une photo avant d’enregistrer une vidéo.");
  const frameDuration = 1000 / fps;
  const clusters: Uint8Array[] = [];
  let clusterTime = -1;
  let clusterBlocks: Uint8Array[] = [];

  for (let index = 0; index < frames.length; index += 1) {
    const time = Math.round(index * frameDuration);
    if (clusterTime < 0 || time - clusterTime > 30_000) {
      if (clusterBlocks.length) {
        clusters.push(
          element(
            0x1f43b675,
            concat([element(0xe7, uint(clusterTime)), ...clusterBlocks]),
          ),
        );
      }
      clusterTime = time;
      clusterBlocks = [];
    }
    const vp8 = extractVp8(
      new Uint8Array(await frames[index].image.arrayBuffer()),
    );
    clusterBlocks.push(simpleBlock(time - clusterTime, vp8));
    onProgress?.(index + 1, frames.length);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  clusters.push(
    element(
      0x1f43b675,
      concat([element(0xe7, uint(clusterTime)), ...clusterBlocks]),
    ),
  );

  const ebmlHeader = element(
    0x1a45dfa3,
    concat([
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
    concat([
      element(0x2ad7b1, uint(1_000_000)),
      element(0x4489, float64(frames.length * frameDuration)),
      element(0x4d80, text("Stomo")),
      element(0x5741, text("Stomo")),
    ]),
  );
  const video = element(
    0xe0,
    concat([element(0xb0, uint(width)), element(0xba, uint(height))]),
  );
  const trackEntry = element(
    0xae,
    concat([
      element(0xd7, uint(1)),
      element(0x73c5, uint(1)),
      element(0x83, uint(1)),
      element(0x86, text("V_VP8")),
      element(0x23e383, uint(Math.round(1_000_000_000 / fps))),
      video,
    ]),
  );
  const tracks = element(0x1654ae6b, trackEntry);
  const segment = element(0x18538067, concat([info, tracks, ...clusters]));
  return new Blob([ebmlHeader, segment], { type: "video/webm" });
}
