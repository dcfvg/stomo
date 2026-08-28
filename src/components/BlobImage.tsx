import { useEffect, useState } from "react";

interface BlobImageProps extends Omit<
  React.ImgHTMLAttributes<HTMLImageElement>,
  "src"
> {
  blob: Blob;
}

export function BlobImage({ blob, ...props }: BlobImageProps) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const next = URL.createObjectURL(blob);
    // L’URL est une ressource externe à React : elle est créée et libérée avec l’effet.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  if (!url) return null;
  return <img src={url} {...props} />;
}
