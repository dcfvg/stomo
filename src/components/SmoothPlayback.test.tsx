import { act, createRef } from "react";
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FrameRecord } from "../types";
import { SmoothPlayback, type SmoothPlaybackHandle } from "./SmoothPlayback";

function frame(id: string, position: number): FrameRecord {
  const image = new Blob([id], { type: "image/webp" });
  return {
    id,
    projectId: "film",
    position,
    image,
    thumbnail: image,
  };
}

describe("surface de lecture sans flash", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("garde l’image précédente visible jusqu’au décodage de la suivante", async () => {
    const decoders: Array<() => void> = [];
    class PreloadImage {
      decoding = "auto";
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      src = "";
      decode = () =>
        new Promise<void>((resolve) => {
          decoders.push(resolve);
        });
    }
    vi.stubGlobal("Image", PreloadImage);
    let nextUrl = 0;
    vi.spyOn(URL, "createObjectURL").mockImplementation(
      () => `blob:frame-${++nextUrl}`,
    );
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const playbackRef = createRef<SmoothPlaybackHandle>();
    const view = render(<SmoothPlayback ref={playbackRef} />);
    const first = frame("first", 0);
    const second = frame("second", 1);

    let firstPreload!: Promise<void>;
    act(() => {
      firstPreload = playbackRef.current!.preload([first]);
    });
    decoders.shift()?.();
    await act(async () => firstPreload);
    await act(async () => playbackRef.current!.show(first));
    expect(view.container.querySelectorAll("img.is-active")).toHaveLength(1);

    let secondShow!: Promise<void>;
    act(() => {
      secondShow = playbackRef.current!.show(second);
    });
    expect(view.container.querySelectorAll("img.is-active")).toHaveLength(1);
    expect(
      view.container.querySelector("img.is-active")?.getAttribute("src"),
    ).toBe("blob:frame-1");

    decoders.shift()?.();
    await act(async () => secondShow);
    expect(view.container.querySelectorAll("img")).toHaveLength(2);
    expect(view.container.querySelectorAll("img.is-active")).toHaveLength(1);
    expect(
      view.container.querySelector("img.is-active")?.getAttribute("src"),
    ).toBe("blob:frame-2");
  });
});
