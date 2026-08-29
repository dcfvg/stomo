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

    const onSnapshot = vi.fn();
    const result = await captureVideoFrame(video, "landscape", onSnapshot);

    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
    expect(result.sourceBelowFullHd).toBe(true);
    expect(result.image.type).toBe("image/webp");
    expect(onSnapshot).toHaveBeenCalledOnce();
    expect(drawImage).toHaveBeenNthCalledWith(
      1,
      video,
      0,
      60,
      640,
      360,
      0,
      0,
      1920,
      1080,
    );
    expect(drawImage).toHaveBeenNthCalledWith(
      2,
      video,
      0,
      60,
      640,
      360,
      0,
      0,
      240,
      135,
    );
  });

  it("produit une photo verticale en 1080 × 1920", async () => {
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
      videoWidth: { value: 1920 },
      videoHeight: { value: 1080 },
    });

    const result = await captureVideoFrame(video, "portrait");

    expect(result.width).toBe(1080);
    expect(result.height).toBe(1920);
    expect(result.sourceBelowFullHd).toBe(true);
    expect(drawImage).toHaveBeenNthCalledWith(
      1,
      video,
      656,
      0,
      608,
      1080,
      0,
      0,
      1080,
      1920,
    );
  });
});
