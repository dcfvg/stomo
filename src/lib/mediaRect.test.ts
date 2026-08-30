import { describe, expect, it } from "vitest";
import { fitMediaRect } from "./mediaRect";

describe("rectangle visible de la caméra", () => {
  it("centre une vidéo paysage dans une scène plus large", () => {
    const result = fitMediaRect(640, 300, 1920, 1080)!;
    expect(result.left).toBeCloseTo((640 - 300 * (16 / 9)) / 2);
    expect(result.top).toBe(0);
    expect(result.width).toBeCloseTo(300 * (16 / 9));
    expect(result.height).toBe(300);
  });

  it("centre une vidéo verticale dans une scène plus large", () => {
    const result = fitMediaRect(360, 578, 1080, 1920)!;
    expect(result.left).toBeCloseTo((360 - 578 * (9 / 16)) / 2);
    expect(result.top).toBe(0);
    expect(result.width).toBeCloseTo(578 * (9 / 16));
    expect(result.height).toBe(578);
  });

  it("ignore une scène qui n’a pas encore de taille", () => {
    expect(fitMediaRect(0, 300, 1920, 1080)).toBeNull();
  });
});
