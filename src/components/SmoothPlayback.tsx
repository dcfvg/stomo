import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import type { FrameRecord } from "../types";

interface PreparedImage {
  id: string;
  url: string;
  image: HTMLImageElement;
  ready: Promise<void>;
  lastUsedAt: number;
}

export interface SmoothPlaybackHandle {
  preload: (frames: FrameRecord[]) => Promise<void>;
  show: (frame: FrameRecord) => Promise<void>;
  clear: () => void;
}

const MAX_PREPARED_IMAGES = 10;

function waitUntilReady(image: HTMLImageElement, url: string) {
  return new Promise<void>((resolve, reject) => {
    let finished = false;
    const complete = (callback: () => void) => {
      if (finished) return;
      finished = true;
      image.onload = null;
      image.onerror = null;
      callback();
    };
    image.onload = () => complete(resolve);
    image.onerror = () =>
      complete(() => reject(new Error("Cette photo ne peut pas être lue.")));
    image.src = url;
    if (typeof image.decode === "function")
      void image.decode().then(
        () => complete(resolve),
        () => undefined,
      );
  });
}

export const SmoothPlayback = forwardRef<SmoothPlaybackHandle>(
  function SmoothPlayback(_, forwardedRef) {
    const imageRefs = useRef<
      [HTMLImageElement | null, HTMLImageElement | null]
    >([null, null]);
    const prepared = useRef(new Map<string, PreparedImage>());
    const activeLayer = useRef(0);
    const layerFrameIds = useRef<[string | null, string | null]>([null, null]);
    const generation = useRef(0);

    const ensurePrepared = useCallback((frame: FrameRecord) => {
      const existing = prepared.current.get(frame.id);
      if (existing) {
        existing.lastUsedAt = Date.now();
        return existing;
      }
      const url = URL.createObjectURL(frame.image);
      const image = new Image();
      image.decoding = "async";
      const entry: PreparedImage = {
        id: frame.id,
        url,
        image,
        ready: waitUntilReady(image, url),
        lastUsedAt: Date.now(),
      };
      prepared.current.set(frame.id, entry);
      return entry;
    }, []);

    const trimPrepared = useCallback(() => {
      if (prepared.current.size <= MAX_PREPARED_IMAGES) return;
      const displayed = new Set(layerFrameIds.current);
      const removable = [...prepared.current.values()]
        .filter((entry) => !displayed.has(entry.id))
        .sort((a, b) => a.lastUsedAt - b.lastUsedAt);
      while (prepared.current.size > MAX_PREPARED_IMAGES && removable.length) {
        const entry = removable.shift()!;
        prepared.current.delete(entry.id);
        URL.revokeObjectURL(entry.url);
      }
    }, []);

    const clear = useCallback(() => {
      generation.current += 1;
      imageRefs.current.forEach((image) => {
        image?.classList.remove("is-active");
        image?.removeAttribute("src");
      });
      prepared.current.forEach((entry) => URL.revokeObjectURL(entry.url));
      prepared.current.clear();
      activeLayer.current = 0;
      layerFrameIds.current = [null, null];
    }, []);

    useImperativeHandle(
      forwardedRef,
      () => ({
        preload: async (frames) => {
          const currentGeneration = generation.current;
          await Promise.all(frames.map((frame) => ensurePrepared(frame).ready));
          if (generation.current === currentGeneration) trimPrepared();
        },
        show: async (frame) => {
          const currentGeneration = generation.current;
          const entry = ensurePrepared(frame);
          await entry.ready;
          if (generation.current !== currentGeneration) return;

          const nextLayer = activeLayer.current === 0 ? 1 : 0;
          const nextImage = imageRefs.current[nextLayer];
          const previousImage = imageRefs.current[activeLayer.current];
          if (!nextImage) return;
          nextImage.src = entry.url;
          nextImage.alt = `Photo ${frame.position + 1} du film`;
          if (typeof nextImage.decode === "function") {
            try {
              await nextImage.decode();
            } catch {
              // L’image de préchargement a déjà validé ce même fichier.
            }
          }
          if (generation.current !== currentGeneration) return;

          nextImage.classList.add("is-active");
          previousImage?.classList.remove("is-active");
          activeLayer.current = nextLayer;
          layerFrameIds.current[nextLayer] = frame.id;
          trimPrepared();
        },
        clear,
      }),
      [clear, ensurePrepared, trimPrepared],
    );

    useEffect(() => clear, [clear]);

    return (
      <div className="smooth-playback" aria-live="off">
        {[0, 1].map((index) => (
          <img
            alt=""
            className="smooth-playback__image"
            key={index}
            ref={(image) => {
              imageRefs.current[index as 0 | 1] = image;
            }}
          />
        ))}
      </div>
    );
  },
);
