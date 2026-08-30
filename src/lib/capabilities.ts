interface NavigatorWithAppleStandalone extends Navigator {
  standalone?: boolean;
}

type StorageManagerWithDirectory = StorageManager & {
  getDirectory?: () => Promise<FileSystemDirectoryHandle>;
};

type WindowWithImageOptimizations = Window & {
  OffscreenCanvas?: typeof OffscreenCanvas;
  createImageBitmap?: typeof createImageBitmap;
  Worker?: typeof Worker;
  ResizeObserver?: typeof ResizeObserver;
};

export interface RuntimeCapabilities {
  secureContext: boolean;
  camera: boolean;
  indexedDb: boolean;
  webmPlayback: boolean;
  fileSharing: boolean;
  appleMobileInstall: boolean;
  fullscreen: boolean;
  mediaSession: boolean;
  persistentStorage: boolean;
  opfs: boolean;
  imageWorker: boolean;
  visualViewport: boolean;
  resizeObserver: boolean;
}

export function canPlayWebm(targetDocument: Document = document) {
  try {
    const video = targetDocument.createElement("video");
    return Boolean(video.canPlayType('video/webm; codecs="vp8"'));
  } catch {
    return false;
  }
}

export function canUseFullscreen(targetDocument: Document = document) {
  return (
    targetDocument.fullscreenEnabled === true &&
    typeof targetDocument.documentElement.requestFullscreen === "function"
  );
}

export function canUseCamera(targetNavigator: Navigator = navigator) {
  return typeof targetNavigator.mediaDevices?.getUserMedia === "function";
}

export function canUseImageWorker(targetWindow: Window = window) {
  const imageWindow = targetWindow as WindowWithImageOptimizations;
  return (
    typeof imageWindow.OffscreenCanvas === "function" &&
    typeof imageWindow.createImageBitmap === "function" &&
    typeof imageWindow.Worker === "function"
  );
}

export function canUseResizeObserver(targetWindow: Window = window) {
  return (
    typeof (targetWindow as WindowWithImageOptimizations).ResizeObserver ===
    "function"
  );
}

function canShareFile(targetNavigator: Navigator) {
  if (
    typeof targetNavigator.share !== "function" ||
    typeof targetNavigator.canShare !== "function"
  )
    return false;
  try {
    const probe = new File(["stomo"], "stomo.txt", { type: "text/plain" });
    return targetNavigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

export function isAppleMobileInstallEnvironment(
  targetNavigator: Navigator = navigator,
) {
  return "standalone" in (targetNavigator as NavigatorWithAppleStandalone);
}

export function isStandaloneApp(
  targetWindow: Window = window,
  targetNavigator: Navigator = navigator,
) {
  return (
    targetWindow.matchMedia?.("(display-mode: standalone)").matches === true ||
    Boolean((targetNavigator as NavigatorWithAppleStandalone).standalone)
  );
}

export function detectRuntimeCapabilities(
  targetWindow: Window = window,
  targetNavigator: Navigator = navigator,
  targetDocument: Document = document,
): RuntimeCapabilities {
  const storage = targetNavigator.storage as
    | StorageManagerWithDirectory
    | undefined;
  return {
    secureContext: targetWindow.isSecureContext !== false,
    camera: canUseCamera(targetNavigator),
    indexedDb: "indexedDB" in targetWindow,
    webmPlayback: canPlayWebm(targetDocument),
    fileSharing: canShareFile(targetNavigator),
    appleMobileInstall: isAppleMobileInstallEnvironment(targetNavigator),
    fullscreen: canUseFullscreen(targetDocument),
    mediaSession: "mediaSession" in targetNavigator,
    persistentStorage: typeof storage?.persist === "function",
    opfs: typeof storage?.getDirectory === "function",
    imageWorker: canUseImageWorker(targetWindow),
    visualViewport: Boolean(targetWindow.visualViewport),
    resizeObserver: canUseResizeObserver(targetWindow),
  };
}

export function canSharePreparedFile(
  file: File,
  targetNavigator: Navigator = navigator,
) {
  if (!isAppleMobileInstallEnvironment(targetNavigator)) return false;
  if (
    typeof targetNavigator.share !== "function" ||
    typeof targetNavigator.canShare !== "function"
  )
    return false;
  try {
    return targetNavigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}
