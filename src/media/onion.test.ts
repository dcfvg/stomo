import { describe, expect, it } from "vitest";
import type { FrameSummary, OnionFrameCount } from "../types";
import { buildOnionLayers } from "./onion";

const frames: FrameSummary[] = Array.from({ length: 5 }, (_, position) => ({
  id: `frame-${position}`,
  projectId: "film",
  position,
  thumbnail: new Blob([String(position)]),
}));

describe("pelure d’oignon progressive", () => {
  it.each([
    [1, ["frame-4"], [0.4]],
    [2, ["frame-3", "frame-4"], [0.22, 0.4]],
    [3, ["frame-2", "frame-3", "frame-4"], [0.12, 0.22, 0.4]],
  ] as Array<[OnionFrameCount, string[], number[]]>)(
    "superpose %i image(s) sans charger les plus anciennes",
    (count, expectedFrames, expectedOpacities) => {
      const layers = buildOnionLayers(frames, count, 0.4);
      expect(layers.map(({ frame }) => frame.id)).toEqual(expectedFrames);
      layers.forEach(({ opacity }, index) =>
        expect(opacity).toBeCloseTo(expectedOpacities[index]),
      );
    },
  );
});
