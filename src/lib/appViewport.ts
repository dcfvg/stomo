export interface AppViewportMeasurement {
  height: number;
  topInset: number;
  bottomInset: number;
  fullscreenHeight: number;
}

export function measureAppViewport(
  targetWindow: Window = window,
  targetDocument: Document = document,
  previousFullscreenHeight = 0,
): AppViewportMeasurement {
  const visibleHeight = Math.max(
    1,
    Math.round(targetWindow.visualViewport?.height ?? targetWindow.innerHeight),
  );
  const topInset = Math.max(
    0,
    Math.round(targetWindow.visualViewport?.offsetTop ?? 0),
  );
  const fullscreenActive = Boolean(targetDocument.fullscreenElement);
  const fullscreenHeight = fullscreenActive
    ? Math.max(
        previousFullscreenHeight,
        visibleHeight,
        Math.round(targetWindow.innerHeight),
      )
    : 0;
  const height = fullscreenActive ? fullscreenHeight : visibleHeight;

  return {
    height,
    topInset,
    bottomInset: fullscreenActive
      ? Math.max(0, height - topInset - visibleHeight)
      : 0,
    fullscreenHeight,
  };
}
