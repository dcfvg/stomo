import { TIMELINE_OVERSCAN, TIMELINE_WINDOW_SIZE } from "../config";

export interface TimelineRange {
  start: number;
  end: number;
}

export function rangeAroundTimelineIndex(
  total: number,
  index: number,
): TimelineRange {
  const size = Math.min(total, TIMELINE_WINDOW_SIZE);
  const start = Math.max(
    0,
    Math.min(total - size, index - Math.floor(size / 2)),
  );
  return { start, end: start + size };
}

export function getVirtualTimelineRange(
  total: number,
  scrollLeft: number,
  viewportWidth: number,
  itemStride: number,
): TimelineRange {
  if (!total) return { start: 0, end: 0 };
  const firstVisible = Math.max(0, Math.floor(scrollLeft / itemStride));
  const visibleCount = Math.max(1, Math.ceil(viewportWidth / itemStride));
  const desiredStart = Math.max(0, firstVisible - TIMELINE_OVERSCAN);
  const desiredEnd = Math.min(
    total,
    firstVisible + visibleCount + TIMELINE_OVERSCAN,
  );
  if (desiredEnd - desiredStart >= TIMELINE_WINDOW_SIZE)
    return { start: desiredStart, end: desiredStart + TIMELINE_WINDOW_SIZE };
  const missing = TIMELINE_WINDOW_SIZE - (desiredEnd - desiredStart);
  const start = Math.max(0, desiredStart - missing);
  const end = Math.min(
    total,
    Math.max(desiredEnd, start + TIMELINE_WINDOW_SIZE),
  );
  return { start: Math.max(0, end - TIMELINE_WINDOW_SIZE), end };
}
