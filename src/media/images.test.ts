import { afterEach, describe, expect, it, vi } from "vitest";
import { captureVideoFrame } from "./images";

describe("captureVideoFrame", () => {
  afterEach(() => vi.restoreAllMocks());

  it("recadre la caméra en paysage 16:9 et prépare une vignette", async () => {
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      (callback, type) =>
        callback(new Blob([type ?? "image"], { type: type ?? "image/webp" })),
    );
    const video = document.createElement("video");
    Object.defineProperties(video, {
      videoWidth: { value: 640 },
      videoHeight: { value: 480 },
    });

    const result = await captureVideoFrame(video);

    expect(result.width).toBe(640);
    expect(result.height).toBe(360);
    expect(result.image.type).toBe("image/webp");
    expect(drawImage).toHaveBeenNthCalledWith(
      1,
      video,
      0,
      60,
      640,
      360,
      0,
      0,
      640,
      360,
    );
    expect(drawImage).toHaveBeenNthCalledWith(
      2,
      expect.any(HTMLCanvasElement),
      0,
      0,
      240,
      135,
    );
  });
});
