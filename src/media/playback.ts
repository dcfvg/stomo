import type { FrameSummary } from "../types";

interface LoopPlaybackOptions<T extends FrameSummary> {
  frames: T[];
  fps: number;
  isActive: () => boolean;
  leadIn?: { frame: FrameSummary; durationMs: number };
  show: (frame: FrameSummary) => Promise<void>;
  preload: (frames: FrameSummary[]) => Promise<void>;
  onFirstFrame?: () => void;
  waitFrame?: (duration: number) => Promise<void>;
}

export async function playFramesInLoop<T extends FrameSummary>({
  frames,
  fps,
  isActive,
  leadIn,
  show,
  preload,
  onFirstFrame,
  waitFrame = (duration) =>
    new Promise<void>((resolve) => setTimeout(resolve, duration)),
}: LoopPlaybackOptions<T>) {
  if (!frames.length) return;
  await preload([...(leadIn ? [leadIn.frame] : []), ...frames.slice(0, 3)]);
  let firstFrameShown = false;
  while (isActive()) {
    if (leadIn) {
      await show(leadIn.frame);
      if (!isActive()) return;
      if (!firstFrameShown) {
        firstFrameShown = true;
        onFirstFrame?.();
      }
      await waitFrame(leadIn.durationMs);
    }
    for (let index = 0; index < frames.length; index += 1) {
      if (!isActive()) return;
      await show(frames[index]);
      if (!isActive()) return;
      if (!firstFrameShown) {
        firstFrameShown = true;
        onFirstFrame?.();
      }
      const upcoming: FrameSummary[] = [1, 2, 3].map(
        (offset) => frames[(index + offset) % frames.length],
      );
      if (leadIn && index === frames.length - 1) upcoming.unshift(leadIn.frame);
      void preload(upcoming).catch(() => undefined);
      await waitFrame(1000 / fps);
    }
  }
}
