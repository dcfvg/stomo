import { useEffect, useState } from "react";

interface BlobImageProps extends Omit<
  React.ImgHTMLAttributes<HTMLImageElement>,
  "src"
> {
  blob: Blob;
  fallbackBlob?: Blob;
}

export function BlobImage({
  blob,
  fallbackBlob,
  onError,
  ...props
}: BlobImageProps) {
  const [url, setUrl] = useState("");
  const [usingFallback, setUsingFallback] = useState(false);
  const displayedBlob = usingFallback && fallbackBlob ? fallbackBlob : blob;

  useEffect(() => {
    // Une nouvelle image doit toujours être essayée avant son secours.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUsingFallback(false);
  }, [blob]);

  useEffect(() => {
    const next = URL.createObjectURL(displayedBlob);
    // L’URL est une ressource externe à React : elle est créée et libérée avec l’effet.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [displayedBlob]);
  if (!url) return null;
  return (
    <img
      src={url}
      onError={(event) => {
        if (fallbackBlob && !usingFallback) setUsingFallback(true);
        onError?.(event);
      }}
      {...props}
    />
  );
}
