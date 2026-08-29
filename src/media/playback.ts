import type { FrameSummary } from "../types";

interface LoopPlaybackOptions<T extends FrameSummary> {
  frames: T[];
  fps: number;
  isActive: () => boolean;
  show: (frame: T) => Promise<void>;
  preload: (frames: T[]) => Promise<void>;
  onFirstFrame?: () => void;
  waitFrame?: (duration: number) => Promise<void>;
}

export async function playFramesInLoop<T extends FrameSummary>({
  frames,
  fps,
  isActive,
  show,
  preload,
  onFirstFrame,
  waitFrame = (duration) =>
    new Promise<void>((resolve) => setTimeout(resolve, duration)),
}: LoopPlaybackOptions<T>) {
  if (!frames.length) return;
  await preload(frames.slice(0, 3));
  let firstFrameShown = false;
  while (isActive()) {
    for (let index = 0; index < frames.length; index += 1) {
      if (!isActive()) return;
      await show(frames[index]);
      if (!isActive()) return;
      if (!firstFrameShown) {
        firstFrameShown = true;
        onFirstFrame?.();
      }
      const upcoming = [1, 2, 3].map(
        (offset) => frames[(index + offset) % frames.length],
      );
      void preload(upcoming).catch(() => undefined);
      await waitFrame(1000 / fps);
    }
  }
}
