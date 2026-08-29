import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FrameSummary } from "../types";
import { getVirtualTimelineRange } from "../lib/timeline";
import { VirtualTimeline } from "./VirtualTimeline";

vi.mock("./FrameThumbnail", () => ({
  FrameThumbnail: () => <img alt="" />,
}));

const frames: FrameSummary[] = Array.from({ length: 480 }, (_, position) => ({
  id: `frame-${position}`,
  projectId: "film",
  position,
  thumbnail: new Blob([String(position)]),
}));

describe("frise virtualisée", () => {
  it("limite la fenêtre à 32 images au début, au milieu et à la fin", () => {
    expect(getVirtualTimelineRange(480, 0, 360, 126)).toEqual({
      start: 0,
      end: 32,
    });
    const middle = getVirtualTimelineRange(480, 30_000, 360, 126);
    expect(middle.end - middle.start).toBe(32);
    expect(getVirtualTimelineRange(480, 60_000, 360, 126)).toEqual({
      start: 448,
      end: 480,
    });
  });

  it("ouvre la dernière photo sans rendre les 480 vignettes", async () => {
    const open = vi.fn();
    const { container } = render(
      <VirtualTimeline
        frames={frames}
        orientation="landscape"
        selectedFrameId="frame-479"
        onOpenFrame={open}
      />,
    );

    expect(container.querySelectorAll(".timeline-frame")).toHaveLength(32);
    const last = screen.getByRole("button", { name: "Ouvrir la photo 480" });
    fireEvent.click(last);
    expect(open).toHaveBeenCalledWith(frames[479]);
  });
});
