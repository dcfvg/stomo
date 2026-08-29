import { describe, expect, it, vi } from "vitest";
import type { FrameSummary } from "../types";
import { playFramesInLoop } from "./playback";

function frame(position: number): FrameSummary {
  return {
    id: `frame-${position}`,
    projectId: "film",
    position,
    thumbnail: new Blob([String(position)]),
  };
}

describe("lecture du film en boucle", () => {
  it("revient à la première image et s’arrête à la demande", async () => {
    const frames = [frame(0), frame(1), frame(2)];
    const shown: string[] = [];
    let active = true;
    const preload = vi.fn().mockResolvedValue(undefined);

    await playFramesInLoop({
      frames,
      fps: 8,
      isActive: () => active,
      preload,
      show: async (current) => {
        shown.push(current.id);
        if (shown.length === 5) active = false;
      },
      waitFrame: async () => undefined,
    });

    expect(shown).toEqual([
      "frame-0",
      "frame-1",
      "frame-2",
      "frame-0",
      "frame-1",
    ]);
    expect(preload).toHaveBeenCalledWith([frames[1], frames[2], frames[0]]);
  });

  it.each([1, 8, 240, 480])(
    "reboucle et reste interruptible avec %i image(s)",
    async (count) => {
      const frames = Array.from({ length: count }, (_, index) => frame(index));
      let active = true;
      let shown = 0;

      await playFramesInLoop({
        frames,
        fps: 12,
        isActive: () => active,
        preload: async () => undefined,
        show: async (current) => {
          expect(current.id).toBe(`frame-${shown % count}`);
          shown += 1;
          if (shown === count + 1) active = false;
        },
        waitFrame: async () => undefined,
      });

      expect(shown).toBe(count + 1);
    },
  );
});
