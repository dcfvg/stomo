import { useEffect, useState } from "react";
import { getFrameImage } from "../storage/database";
import type { FrameSummary } from "../types";
import { BlobImage } from "./BlobImage";

interface StoredFrameImageProps extends Omit<
  React.ImgHTMLAttributes<HTMLImageElement>,
  "src"
> {
  frame: FrameSummary;
}

export function StoredFrameImage({ frame, ...props }: StoredFrameImageProps) {
  const [blob, setBlob] = useState<Blob | null>(null);

  useEffect(() => {
    let alive = true;
    void getFrameImage(frame.id)
      .then((image) => {
        if (alive) setBlob(image);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [frame.id]);

  return blob ? <BlobImage blob={blob} {...props} /> : null;
}
