import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { MAX_PLAYBACK_CACHE } from "../config";
import type { FrameSummary } from "../types";

interface PreparedImage {
  id: string;
  url: string;
  image: HTMLImageElement;
  ready: Promise<void>;
  lastUsedAt: number;
}

export interface SmoothPlaybackHandle {
  preload: (frames: FrameSummary[]) => Promise<void>;
  show: (frame: FrameSummary) => Promise<void>;
  clear: () => void;
}

interface SmoothPlaybackProps {
  loadImage?: (frameId: string) => Promise<Blob>;
}

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

export const SmoothPlayback = forwardRef<
  SmoothPlaybackHandle,
  SmoothPlaybackProps
>(function SmoothPlayback({ loadImage }: SmoothPlaybackProps, forwardedRef) {
  const imageRefs = useRef<[HTMLImageElement | null, HTMLImageElement | null]>([
    null,
    null,
  ]);
  const prepared = useRef(new Map<string, PreparedImage>());
  const loading = useRef(new Map<string, Promise<PreparedImage>>());
  const activeLayer = useRef(0);
  const layerFrameIds = useRef<[string | null, string | null]>([null, null]);
  const generation = useRef(0);

  const ensurePrepared = useCallback(
    async (frame: FrameSummary) => {
      const existing = prepared.current.get(frame.id);
      if (existing) {
        existing.lastUsedAt = Date.now();
        return existing;
      }
      const pending = loading.current.get(frame.id);
      if (pending) return pending;
      const prepare = (blob: Blob) => {
        const url = URL.createObjectURL(blob);
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
        loading.current.delete(frame.id);
        return entry;
      };
      if ("image" in frame && frame.image instanceof Blob)
        return prepare(frame.image);
      const source = loadImage
        ? loadImage(frame.id)
        : Promise.reject(new Error("Cette photo est introuvable."));
      const request = source.then(prepare);
      loading.current.set(frame.id, request);
      return request;
    },
    [loadImage],
  );

  const trimPrepared = useCallback(() => {
    if (prepared.current.size <= MAX_PLAYBACK_CACHE) return;
    const displayed = new Set(layerFrameIds.current);
    const removable = [...prepared.current.values()]
      .filter((entry) => !displayed.has(entry.id))
      .sort((a, b) => a.lastUsedAt - b.lastUsedAt);
    while (prepared.current.size > MAX_PLAYBACK_CACHE && removable.length) {
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
    loading.current.clear();
    activeLayer.current = 0;
    layerFrameIds.current = [null, null];
  }, []);

  useImperativeHandle(
    forwardedRef,
    () => ({
      preload: async (frames) => {
        const currentGeneration = generation.current;
        await Promise.all(
          frames.map(async (frame) => (await ensurePrepared(frame)).ready),
        );
        if (generation.current === currentGeneration) trimPrepared();
      },
      show: async (frame) => {
        const currentGeneration = generation.current;
        const entry = await ensurePrepared(frame);
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
});
