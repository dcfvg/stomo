import { describe, expect, it } from "vitest";
import type { FrameRecord } from "../types";
import { framesToWebm } from "./webm";

function webpWithVp8(payload: Uint8Array) {
  const data = new Uint8Array(20 + payload.length + (payload.length % 2));
  data.set([0x52, 0x49, 0x46, 0x46], 0);
  data.set([0x57, 0x45, 0x42, 0x50], 8);
  data.set([0x56, 0x50, 0x38, 0x20], 12);
  new DataView(data.buffer).setUint32(16, payload.length, true);
  data.set(payload, 20);
  return new Blob([data], { type: "image/webp" });
}

describe("vidéo WebM", () => {
  it("assemble les images VP8 dans une vidéo WebM", async () => {
    const image = webpWithVp8(
      new Uint8Array([0x9d, 0x01, 0x2a, 0x00, 0x05, 0xd0, 0x02]),
    );
    const frames: FrameRecord[] = [0, 1, 2].map((position) => ({
      id: `f${position}`,
      projectId: "p",
      position,
      image,
      thumbnail: image,
    }));
    const progress: number[] = [];
    const video = await framesToWebm(frames, 8, 1280, 720, (current) =>
      progress.push(current),
    );
    const header = new Uint8Array(await video.slice(0, 4).arrayBuffer());
    expect([...header]).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
    expect(video.type).toBe("video/webm");
    expect(progress).toEqual([1, 2, 3]);
  });

  it("ajoute exactement deux secondes de titre sans le retraiter", async () => {
    const image = webpWithVp8(
      new Uint8Array([0x9d, 0x01, 0x2a, 0x00, 0x05, 0xd0, 0x02]),
    );
    const frames: FrameRecord[] = [0, 1].map((position) => ({
      id: `f${position}`,
      projectId: "p",
      position,
      image,
      thumbnail: image,
    }));
    const prepared: string[] = [];
    const video = await framesToWebm(
      frames,
      8,
      1920,
      1080,
      undefined,
      async (frame) => {
        prepared.push(frame.id);
        return frame.image;
      },
      { leadIn: { image, durationMs: 2_000 } },
    );

    expect(prepared).toEqual(["f0", "f1"]);
    const content = new Uint8Array(await video.arrayBuffer());
    const blockCount = content.filter((value) => value === 0xa3).length;
    expect(blockCount).toBeGreaterThanOrEqual(18);
  });

  it("interrompt la préparation sans lire les photos suivantes", async () => {
    const image = webpWithVp8(new Uint8Array([1, 2, 3]));
    const controller = new AbortController();
    const frames: FrameRecord[] = [0, 1].map((position) => ({
      id: `f${position}`,
      projectId: "p",
      position,
      image,
      thumbnail: image,
    }));
    let prepared = 0;

    await expect(
      framesToWebm(
        frames,
        8,
        1920,
        1080,
        undefined,
        async () => {
          prepared += 1;
          controller.abort();
          return image;
        },
        { signal: controller.signal },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(prepared).toBe(1);
  });
});
