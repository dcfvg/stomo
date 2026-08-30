import { afterEach, describe, expect, it, vi } from "vitest";
import { renderTitleCard, wrapTitleText } from "./titleCard";

describe("carton-titre", () => {
  afterEach(() => vi.restoreAllMocks());

  it("répartit un titre accentué sur trois lignes au maximum", () => {
    const lines = wrapTitleText(
      "L’épopée extraordinaire des dinosaures à vélo",
      (value) => value.length * 10,
      180,
    );
    expect(lines).toEqual([
      "L’épopée",
      "extraordinaire des",
      "dinosaures à vélo",
    ]);
  });

  it.each([
    [1920, 1080],
    [1080, 1920],
  ])("produit un WebP noir et blanc en %i × %i", async (width, height) => {
    const fillRect = vi.fn();
    const fillText = vi.fn();
    const context = {
      fillRect,
      fillText,
      measureText: (value: string) => ({ width: value.length * 45 }),
      font: "",
      fillStyle: "",
      textAlign: "start",
      textBaseline: "alphabetic",
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      context,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      (callback, type) => callback(new Blob(["title"], { type: type ?? "" })),
    );

    const blob = await renderTitleCard("É".repeat(60), width, height);

    expect(blob.type).toBe("image/webp");
    expect(fillRect).toHaveBeenCalledWith(0, 0, width, height);
    expect(fillText).toHaveBeenCalled();
    expect(fillText.mock.calls.length).toBeLessThanOrEqual(3);
  });
});
