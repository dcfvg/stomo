import type { FrameSummary, OnionFrameCount } from "../types";

export interface OnionLayer<T extends FrameSummary = FrameSummary> {
  frame: T;
  opacity: number;
}

export function buildOnionLayers<T extends FrameSummary>(
  frames: T[],
  count: OnionFrameCount,
  opacity: number,
): OnionLayer<T>[] {
  const selected = frames.slice(-count);
  return selected.map((frame, index) => {
    const distance = selected.length - index - 1;
    const multiplier = distance === 0 ? 1 : distance === 1 ? 0.55 : 0.3;
    return { frame, opacity: opacity * multiplier };
  });
}
