import { describe, expect, it, vi } from "vitest";
import {
  canSharePreparedFile,
  detectRuntimeCapabilities,
  isAppleMobileInstallEnvironment,
  isStandaloneApp,
} from "./capabilities";

function environment() {
  const targetWindow = {
    isSecureContext: true,
    indexedDB: {},
    matchMedia: vi.fn().mockReturnValue({ matches: false }),
    OffscreenCanvas: class {},
    createImageBitmap: vi.fn(),
    Worker: class {},
    visualViewport: {},
    ResizeObserver: class {},
  } as unknown as Window;
  const targetNavigator = {
    mediaDevices: { getUserMedia: vi.fn() },
    mediaSession: {},
    storage: {
      persist: vi.fn(),
      getDirectory: vi.fn(),
    },
    share: vi.fn(),
    canShare: vi.fn().mockReturnValue(true),
  } as unknown as Navigator;
  const targetDocument = {
    fullscreenEnabled: true,
    documentElement: { requestFullscreen: vi.fn() },
    createElement: vi.fn().mockReturnValue({
      canPlayType: vi.fn().mockReturnValue("probably"),
    }),
  } as unknown as Document;
  return { targetWindow, targetNavigator, targetDocument };
}

describe("capacités du téléphone", () => {
  it("détecte les fonctions disponibles sans lire le user-agent", () => {
    const { targetWindow, targetNavigator, targetDocument } = environment();
    expect(
      detectRuntimeCapabilities(targetWindow, targetNavigator, targetDocument),
    ).toMatchObject({
      secureContext: true,
      camera: true,
      indexedDb: true,
      webmPlayback: true,
      fileSharing: true,
      fullscreen: true,
      mediaSession: true,
      persistentStorage: true,
      opfs: true,
      imageWorker: true,
      visualViewport: true,
      resizeObserver: true,
    });
  });

  it("garde les fonctions principales quand les optimisations manquent", () => {
    const { targetWindow, targetNavigator, targetDocument } = environment();
    delete (targetWindow as { OffscreenCanvas?: unknown }).OffscreenCanvas;
    delete (targetWindow as { visualViewport?: unknown }).visualViewport;
    delete (targetNavigator as { mediaSession?: unknown }).mediaSession;
    (targetNavigator as { storage: StorageManager }).storage =
      {} as StorageManager;
    (targetDocument.createElement as ReturnType<typeof vi.fn>).mockReturnValue({
      canPlayType: () => "",
    });

    expect(
      detectRuntimeCapabilities(targetWindow, targetNavigator, targetDocument),
    ).toMatchObject({
      camera: true,
      indexedDb: true,
      webmPlayback: false,
      mediaSession: false,
      persistentStorage: false,
      opfs: false,
      imageWorker: false,
      visualViewport: false,
    });
  });

  it("reconnaît l’installation Apple grâce à navigator.standalone", () => {
    const appleNavigator = { standalone: false } as unknown as Navigator;
    const standaloneNavigator = { standalone: true } as unknown as Navigator;
    const targetWindow = {
      matchMedia: () => ({ matches: false }),
    } as unknown as Window;

    expect(isAppleMobileInstallEnvironment(appleNavigator)).toBe(true);
    expect(isStandaloneApp(targetWindow, standaloneNavigator)).toBe(true);
  });

  it("ne propose le partage de fichier que dans l’environnement Apple", () => {
    const file = new File(["film"], "film.webm", { type: "video/webm" });
    const appleNavigator = {
      standalone: false,
      share: vi.fn(),
      canShare: vi.fn().mockReturnValue(true),
    } as unknown as Navigator;
    const androidNavigator = {
      share: vi.fn(),
      canShare: vi.fn().mockReturnValue(true),
    } as unknown as Navigator;

    expect(canSharePreparedFile(file, appleNavigator)).toBe(true);
    expect(canSharePreparedFile(file, androidNavigator)).toBe(false);
  });
});
