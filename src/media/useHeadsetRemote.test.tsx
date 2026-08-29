import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useHeadsetRemote } from "./useHeadsetRemote";

type ActionName = "play" | "pause";

describe("bouton lecture/pause du casque", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("déclenche une seule photo et ignore le doublon immédiat", async () => {
    const handlers = new Map<ActionName, MediaSessionActionHandler | null>();
    const play = vi.fn().mockResolvedValue(undefined);
    const pause = vi.fn();
    class AudioMock {
      loop = false;
      volume = 1;
      play = play;
      pause = pause;
    }
    vi.stubGlobal("Audio", AudioMock);
    let quietAudioSize = 0;
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      quietAudioSize = blob instanceof Blob ? blob.size : 0;
      return "blob:quiet";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    Object.defineProperty(navigator, "mediaSession", {
      configurable: true,
      value: {
        metadata: null,
        playbackState: "none",
        setActionHandler: vi.fn(
          (name: ActionName, handler: MediaSessionActionHandler | null) =>
            handlers.set(name, handler),
        ),
      },
    });
    const trigger = vi.fn();
    const { result, unmount } = renderHook(() =>
      useHeadsetRemote(trigger, true),
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(quietAudioSize).toBeGreaterThanOrEqual(160_044);

    act(() => {
      handlers.get("play")?.({ action: "play" } as MediaSessionActionDetails);
      handlers.get("pause")?.({
        action: "pause",
      } as MediaSessionActionDetails);
    });

    expect(trigger).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalled();
    unmount();
    expect(pause).toHaveBeenCalled();
  });

  it("demande un toucher lorsque Chrome bloque le démarrage", async () => {
    class AudioMock {
      loop = false;
      volume = 1;
      play = vi.fn().mockRejectedValue(new Error("autoplay"));
      pause = vi.fn();
    }
    vi.stubGlobal("Audio", AudioMock);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:quiet");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    Object.defineProperty(navigator, "mediaSession", {
      configurable: true,
      value: {
        metadata: null,
        playbackState: "none",
        setActionHandler: vi.fn(),
      },
    });
    const { result } = renderHook(() => useHeadsetRemote(vi.fn(), true));
    await waitFor(() => expect(result.current.status).toBe("blocked"));
  });
});
