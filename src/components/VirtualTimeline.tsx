import { useEffect, useMemo, useRef, useState } from "react";
import {
  getVirtualTimelineRange,
  rangeAroundTimelineIndex,
} from "../lib/timeline";
import type { FilmOrientation, FrameSummary } from "../types";
import { FrameThumbnail } from "./FrameThumbnail";

interface VirtualTimelineProps {
  frames: FrameSummary[];
  orientation: FilmOrientation;
  selectedFrameId: string | null;
  onOpenFrame: (frame: FrameSummary) => void;
}

export function VirtualTimeline({
  frames,
  orientation,
  selectedFrameId,
  onOpenFrame,
}: VirtualTimelineProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const selectedIndex = frames.findIndex(
    (frame) => frame.id === selectedFrameId,
  );
  const focusedIndex = selectedIndex >= 0 ? selectedIndex : frames.length - 1;
  const itemWidth = orientation === "portrait" ? 72 : 118;
  const itemStride = itemWidth + 8;
  const [range, setRange] = useState(() =>
    rangeAroundTimelineIndex(frames.length, focusedIndex),
  );

  useEffect(() => {
    if (focusedIndex < 0) return;
    const frame = window.requestAnimationFrame(() => {
      setRange(rangeAroundTimelineIndex(frames.length, focusedIndex));
      const list = listRef.current;
      if (!list) return;
      const left = Math.max(
        0,
        focusedIndex * itemStride - (list.clientWidth - itemWidth) / 2,
      );
      if (typeof list.scrollTo === "function") list.scrollTo({ left });
      else list.scrollLeft = left;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusedIndex, frames.length, itemStride, itemWidth]);

  const visibleFrames = useMemo(
    () => frames.slice(range.start, range.end),
    [frames, range.end, range.start],
  );

  if (!frames.length)
    return <p className="timeline-empty">Ta première photo apparaîtra ici.</p>;

  return (
    <div
      className="timeline-list"
      ref={listRef}
      onScroll={(event) => {
        const list = event.currentTarget;
        setRange(
          getVirtualTimelineRange(
            frames.length,
            list.scrollLeft,
            list.clientWidth,
            itemStride,
          ),
        );
      }}
    >
      <div
        className="timeline-track"
        style={{
          paddingLeft: range.start * itemStride,
          paddingRight: (frames.length - range.end) * itemStride,
        }}
      >
        {visibleFrames.map((frame) => (
          <button
            className={
              frame.id === selectedFrameId
                ? "timeline-frame timeline-frame--selected"
                : "timeline-frame"
            }
            type="button"
            key={frame.id}
            onClick={() => onOpenFrame(frame)}
            aria-label={`Ouvrir la photo ${frame.position + 1}`}
          >
            <FrameThumbnail frame={frame} alt="" />
            <span>{frame.position + 1}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
