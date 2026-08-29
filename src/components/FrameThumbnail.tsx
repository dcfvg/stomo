import { useCallback, useEffect, useState } from "react";
import { getFrameImage } from "../storage/database";
import type { FrameSummary } from "../types";
import { BlobImage } from "./BlobImage";

interface FrameThumbnailProps extends Omit<
  React.ImgHTMLAttributes<HTMLImageElement>,
  "src"
> {
  frame: FrameSummary;
}

export function FrameThumbnail({ frame, ...props }: FrameThumbnailProps) {
  const [fallback, setFallback] = useState<Blob | null>(null);
  const loadFallback = useCallback(() => {
    if (fallback) return;
    void getFrameImage(frame.id)
      .then(setFallback)
      .catch(() => undefined);
  }, [fallback, frame.id]);

  useEffect(() => {
    if (frame.thumbnailNeedsRepair || frame.thumbnail.size === 0)
      loadFallback();
  }, [frame.thumbnail.size, frame.thumbnailNeedsRepair, loadFallback]);

  if (fallback) return <BlobImage blob={fallback} {...props} />;
  if (!frame.thumbnail.size) return null;
  return <BlobImage blob={frame.thumbnail} onError={loadFallback} {...props} />;
}
