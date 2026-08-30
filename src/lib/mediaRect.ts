export interface MediaRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function fitMediaRect(
  containerWidth: number,
  containerHeight: number,
  mediaWidth: number,
  mediaHeight: number,
): MediaRect | null {
  if (
    containerWidth <= 0 ||
    containerHeight <= 0 ||
    mediaWidth <= 0 ||
    mediaHeight <= 0
  )
    return null;
  const scale = Math.min(
    containerWidth / mediaWidth,
    containerHeight / mediaHeight,
  );
  const width = mediaWidth * scale;
  const height = mediaHeight * scale;
  return {
    left: (containerWidth - width) / 2,
    top: (containerHeight - height) / 2,
    width,
    height,
  };
}
