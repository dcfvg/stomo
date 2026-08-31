import {
  RiArrowGoBackLine,
  RiArrowDownSLine,
  RiArrowLeftLine,
  RiArrowRightLine,
  RiArrowUpSLine,
  RiCameraFill,
  RiCameraSwitchLine,
  RiContrast2Line,
  RiDeleteBinLine,
  RiDownload2Line,
  RiEditLine,
  RiFileCopyLine,
  RiFilmLine,
  RiFolderDownloadLine,
  RiGalleryLine,
  RiGhostLine,
  RiGridLine,
  RiHeadphoneLine,
  RiImageDownloadLine,
  RiLandscapeLine,
  RiListCheck2,
  RiPlayFill,
  RiCloseLine,
  RiSettings3Line,
  RiShareForwardLine,
  RiSkipForwardFill,
  RiSmartphoneLine,
  RiSpeedLine,
  RiStopFill,
  RiTimerLine,
} from "@remixicon/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  deliverPreparedFile,
  exportPhotosZip,
  exportProject,
  exportSelectedPhoto,
  exportVideo,
  type ExportUpdate,
} from "../media/downloads";
import { cameraSecurityMessage, requestCameraStream } from "../media/camera";
import { captureVideoFrame, FULL_HD } from "../media/images";
import { useHeadsetRemote } from "../media/useHeadsetRemote";
import { buildOnionLayers } from "../media/onion";
import { playFramesInLoop } from "../media/playback";
import { renderTitleCard } from "../media/titleCard";
import { useStomoStore } from "../state/useStomoStore";
import { FRAME_WARNING, MAX_FRAMES } from "../config";
import { getFrameImage } from "../storage/database";
import { fitMediaRect, type MediaRect } from "../lib/mediaRect";
import {
  canPlayWebm,
  canUseCamera,
  canUseResizeObserver,
  isAppleMobileInstallEnvironment,
} from "../lib/capabilities";
import type {
  CountdownSeconds,
  ExportProgress,
  FilmOrientation,
  FrameRecord,
  FrameRate,
  FrameSummary,
  OnionFrameCount,
} from "../types";
import { Dialog } from "./Dialog";
import { SmoothPlayback, type SmoothPlaybackHandle } from "./SmoothPlayback";
import { StoredFrameImage } from "./StoredFrameImage";
import { VirtualTimeline } from "./VirtualTimeline";

type StudioActivity =
  | "idle"
  | "countdown"
  | "capturing"
  | "playing"
  | "exporting";
type PlaybackKind = "film" | "aid" | "compare" | null;
type SettingsSection = "capture" | "motion" | "film" | null;
type CaptureFeedback = "storing" | "stored" | null;

const wait = (duration: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, duration));

async function hasComfortableStorage(frameCount: number) {
  if (frameCount % 10 !== 0 || !navigator.storage?.estimate) return true;
  const estimate = await navigator.storage.estimate();
  if (typeof estimate.quota !== "number" || typeof estimate.usage !== "number")
    return true;
  return estimate.quota - estimate.usage > 25 * 1024 * 1024;
}

function beep() {
  navigator.vibrate?.(55);
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 660;
    gain.gain.setValueAtTime(0.08, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.12);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.13);
    oscillator.addEventListener("ended", () => void context.close());
  } catch {
    // La vibration suffit si le son n'est pas disponible.
  }
}

function cameraLabel(device: MediaDeviceInfo, index: number) {
  return device.label || `Caméra ${index + 1}`;
}

export function Studio({ sessionUi }: { sessionUi?: ReactNode }) {
  const {
    project,
    frames,
    selectedFrameId,
    closeFilm,
    addCapturedFrame,
    removeSelectedFrame,
    duplicateSelectedFrame,
    moveSelectedFrame,
    updateProject,
    shootingPreferences,
    updateShootingPreferences,
    chooseFrame,
  } = useStomoStore();
  const stageRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const playbackSurfaceRef = useRef<SmoothPlaybackHandle>(null);
  const operationToken = useRef(0);
  const exportControllerRef = useRef<AbortController | null>(null);
  const captureRequestPending = useRef(false);
  const flashTimer = useRef<number | null>(null);
  const lowerResolutionNotified = useRef(false);
  const takePhotoRef = useRef<() => void>(() => undefined);
  const [cameraRestart, setCameraRestart] = useState(0);
  const [cameraError, setCameraError] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [cameraContentRect, setCameraContentRect] = useState<MediaRect | null>(
    null,
  );
  const [activity, setActivity] = useState<StudioActivity>("idle");
  const [playbackKind, setPlaybackKind] = useState<PlaybackKind>(null);
  const [previewFrameIndex, setPreviewFrameIndex] = useState(0);
  const [compareLabel, setCompareLabel] = useState<"Avant" | "Après" | null>(
    null,
  );
  const [countdown, setCountdown] = useState<number | null>(null);
  const [captureFlash, setCaptureFlash] = useState(false);
  const [captureFeedback, setCaptureFeedback] = useState<CaptureFeedback>(null);
  const [playbackVisible, setPlaybackVisible] = useState(false);
  const [inspectionFrame, setInspectionFrame] = useState<FrameSummary | null>(
    null,
  );
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>(null);
  const [showExports, setShowExports] = useState(false);
  const [showPhotoExports, setShowPhotoExports] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [exportCancellable, setExportCancellable] = useState(false);
  const [readyFile, setReadyFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [filmTitle, setFilmTitle] = useState(
    () => useStomoStore.getState().project?.name ?? "",
  );
  const videoExportAvailable = useMemo(() => canPlayWebm(), []);
  const appleFileDelivery = useMemo(
    () => isAppleMobileInstallEnvironment(),
    [],
  );

  const selectedFrame = useMemo(
    () => frames.find((frame) => frame.id === selectedFrameId) ?? frames.at(-1),
    [frames, selectedFrameId],
  );
  const onionLayers = project
    ? buildOnionLayers(
        frames,
        shootingPreferences.onionFrameCount,
        shootingPreferences.onionOpacity,
      )
    : [];
  const projectId = project?.id;
  const cameraFacing = shootingPreferences.cameraFacing;
  const cameraDeviceId = shootingPreferences.cameraDeviceId;
  const mediaWidth = project?.width ?? 0;
  const mediaHeight = project?.height ?? 0;

  const updateCameraContentRect = useCallback(() => {
    const stage = stageRef.current;
    if (!stage || !mediaWidth || !mediaHeight) return;
    setCameraContentRect(
      fitMediaRect(
        stage.clientWidth,
        stage.clientHeight,
        mediaWidth,
        mediaHeight,
      ),
    );
  }, [mediaHeight, mediaWidth]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraReady(false);
  }, []);

  const stopActivity = useCallback(() => {
    operationToken.current += 1;
    setCountdown(null);
    playbackSurfaceRef.current?.clear();
    setPlaybackVisible(false);
    setInspectionFrame(null);
    setPlaybackKind(null);
    setPreviewFrameIndex(0);
    setCompareLabel(null);
    setCaptureFlash(false);
    setCaptureFeedback(null);
    setActivity("idle");
  }, []);

  const showCaptureFeedback = useCallback(() => {
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    setCaptureFlash(true);
    setCaptureFeedback("storing");
    flashTimer.current = window.setTimeout(() => {
      flashTimer.current = null;
      setCaptureFlash(false);
    }, 140);
  }, []);

  const confirmStoredCapture = useCallback(async (token: number) => {
    setCaptureFeedback("stored");
    await wait(420);
    if (operationToken.current === token) setCaptureFeedback(null);
  }, []);

  useEffect(() => {
    document.body.classList.add("studio-open");
    return () => {
      document.body.classList.remove("studio-open");
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    };
  }, []);

  useEffect(() => {
    updateCameraContentRect();
    const stage = stageRef.current;
    const observer =
      stage && canUseResizeObserver()
        ? new ResizeObserver(updateCameraContentRect)
        : null;
    if (stage) observer?.observe(stage);
    window.addEventListener("resize", updateCameraContentRect);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateCameraContentRect);
    };
  }, [updateCameraContentRect]);

  useEffect(() => {
    if (!projectId) return;
    let disposed = false;
    const startCamera = async () => {
      stopCamera();
      setCameraError("");
      const securityMessage = cameraSecurityMessage();
      if (securityMessage) {
        setCameraError(securityMessage);
        return;
      }
      if (!canUseCamera()) {
        setCameraError("Ce navigateur ne donne pas accès à la caméra ici.");
        return;
      }
      try {
        const requested = await requestCameraStream(
          navigator.mediaDevices,
          cameraFacing,
          cameraDeviceId ?? null,
        );
        const stream = requested.stream;
        if (requested.selectedDeviceUnavailable) {
          setMessage(
            "Cette caméra n’est plus disponible. Stomo en choisit une autre.",
          );
          void updateShootingPreferences({ cameraDeviceId: null });
        }
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const devices = (
          await navigator.mediaDevices.enumerateDevices()
        ).filter((device) => device.kind === "videoinput");
        if (disposed) return;
        setCameraDevices(devices);
        const activeDeviceId = stream
          .getVideoTracks()[0]
          ?.getSettings().deviceId;
        if (activeDeviceId && !cameraDeviceId)
          void updateShootingPreferences({ cameraDeviceId: activeDeviceId });
        setCameraReady(true);
        updateCameraContentRect();
      } catch {
        setCameraError(
          "La caméra est bloquée. Autorise-la dans les réglages du navigateur, puis réessaie.",
        );
      }
    };
    void startCamera();
    return () => {
      disposed = true;
      stopCamera();
    };
  }, [
    cameraDeviceId,
    cameraFacing,
    cameraRestart,
    projectId,
    stopCamera,
    updateCameraContentRect,
    updateShootingPreferences,
  ]);

  useEffect(() => {
    const changed = () => setCameraRestart((value) => value + 1);
    navigator.mediaDevices?.addEventListener?.("devicechange", changed);
    return () =>
      navigator.mediaDevices?.removeEventListener?.("devicechange", changed);
  }, []);

  useEffect(() => {
    const background = () => {
      stopActivity();
      stopCamera();
    };
    const foreground = () => setCameraRestart((value) => value + 1);
    const visibility = () =>
      document.visibilityState === "hidden" ? background() : foreground();
    window.addEventListener("stomo-background", background);
    window.addEventListener("stomo-foreground", foreground);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("stomo-background", background);
      window.removeEventListener("stomo-foreground", foreground);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [stopActivity, stopCamera]);

  const playFilm = useCallback(
    async (sequence: FrameSummary[]) => {
      if (!project || !sequence.length) return;
      const token = ++operationToken.current;
      const surface = playbackSurfaceRef.current;
      if (!surface) return;
      setInspectionFrame(null);
      setActivity("playing");
      setPlaybackKind("film");
      try {
        const titleImage = await renderTitleCard(
          project.name,
          project.width,
          project.height,
        );
        if (operationToken.current !== token) return;
        const titleFrame: FrameRecord = {
          id: `title-${project.id}-${project.name}`,
          projectId: project.id,
          position: -1,
          image: titleImage,
          thumbnail: titleImage,
          width: project.width,
          height: project.height,
        };
        await playFramesInLoop({
          frames: sequence,
          fps: project.fps,
          leadIn: { frame: titleFrame, durationMs: 2_000 },
          isActive: () => operationToken.current === token,
          show: (frame) => surface.show(frame),
          preload: (framesToPrepare) => surface.preload(framesToPrepare),
          onFirstFrame: () => setPlaybackVisible(true),
        });
      } catch {
        if (operationToken.current === token) {
          setMessage("Une photo du film ne peut pas être affichée.");
          stopActivity();
        }
        return;
      }
    },
    [project, stopActivity],
  );

  const playMotionAid = useCallback(
    async (sequence: FrameSummary[], enabled: boolean, token: number) => {
      if (!sequence.length || !enabled) {
        if (operationToken.current === token) setActivity("idle");
        return;
      }
      const surface = playbackSurfaceRef.current;
      if (!surface) return;
      setActivity("playing");
      setPlaybackKind("aid");
      try {
        await surface.preload(sequence);
        for (let index = 0; index < sequence.length; index += 1) {
          if (operationToken.current !== token) return;
          await surface.show(sequence[index]);
          if (operationToken.current !== token) return;
          setPreviewFrameIndex(index + 1);
          setPlaybackVisible(true);
          await wait(250);
        }
      } catch {
        if (operationToken.current === token) {
          setMessage("Une photo de la relecture ne peut pas être affichée.");
          stopActivity();
        }
        return;
      }
      if (operationToken.current === token) stopActivity();
    },
    [stopActivity],
  );

  const compareLastPhotos = useCallback(async () => {
    if (frames.length < 2 || activity !== "idle") return;
    const token = ++operationToken.current;
    const before = frames.at(-2)!;
    const after = frames.at(-1)!;
    const surface = playbackSurfaceRef.current;
    if (!surface) return;
    setInspectionFrame(null);
    setActivity("playing");
    setPlaybackKind("compare");
    try {
      await surface.preload([before, after]);
      while (operationToken.current === token) {
        await surface.show(before);
        if (operationToken.current !== token) return;
        setPlaybackVisible(true);
        setCompareLabel("Avant");
        await wait(750);
        if (operationToken.current !== token) return;
        await surface.show(after);
        if (operationToken.current !== token) return;
        setCompareLabel("Après");
        await wait(750);
      }
    } catch {
      if (operationToken.current === token) {
        setMessage("Ces deux photos ne peuvent pas être comparées.");
        stopActivity();
      }
    }
  }, [activity, frames, stopActivity]);

  const takePhoto = useCallback(async () => {
    if (
      !project ||
      !videoRef.current ||
      !cameraReady ||
      activity !== "idle" ||
      readyFile ||
      captureRequestPending.current
    )
      return;
    captureRequestPending.current = true;
    let snapshotTaken = false;
    try {
      if (frames.length >= MAX_FRAMES) {
        setMessage(
          `Ton film a déjà ${MAX_FRAMES} photos. Tu peux en supprimer avant de continuer.`,
        );
        return;
      }
      if (!(await hasComfortableStorage(frames.length))) {
        setMessage(
          "La mémoire du téléphone est presque pleine. Sauvegarde ton film, puis demande à un adulte de libérer de la place.",
        );
        return;
      }
      const token = ++operationToken.current;
      setInspectionFrame(null);
      setMessage("");
      setActivity("countdown");
      for (
        let number = shootingPreferences.countdownSeconds;
        number > 0;
        number -= 1
      ) {
        if (operationToken.current !== token) return;
        setCountdown(number);
        beep();
        await wait(1000);
      }
      if (operationToken.current !== token) return;
      setCountdown(null);
      setActivity("capturing");
      const captured = await captureVideoFrame(
        videoRef.current,
        project.orientation,
        () => {
          snapshotTaken = true;
          showCaptureFeedback();
        },
      );
      if (operationToken.current !== token) return;
      await addCapturedFrame(captured);
      await confirmStoredCapture(token);
      if (operationToken.current !== token) return;
      navigator.vibrate?.([45, 40, 80]);
      if (captured.sourceBelowFullHd && !lowerResolutionNotified.current) {
        lowerResolutionNotified.current = true;
        setMessage(
          "La caméra fournit une image moins précise, Stomo l’adapte en Full HD.",
        );
      }
      const updatedFrames = useStomoStore.getState().frames;
      await playMotionAid(
        updatedFrames.slice(-4),
        shootingPreferences.autoPreviewEnabled,
        token,
      );
      if (updatedFrames.length === FRAME_WARNING)
        setMessage(
          `Ton film contient ${FRAME_WARNING} photos. Il reste de la place pour ${MAX_FRAMES - FRAME_WARNING} photos.`,
        );
    } catch (caught) {
      setActivity("idle");
      setCaptureFlash(false);
      setCaptureFeedback(null);
      setMessage(
        caught instanceof Error
          ? snapshotTaken
            ? `La photo a été prise mais n’a pas pu être enregistrée. ${caught.message}`
            : caught.message
          : snapshotTaken
            ? "La photo a été prise mais n’a pas pu être enregistrée."
            : "La photo n’a pas pu être prise.",
      );
    } finally {
      captureRequestPending.current = false;
    }
  }, [
    activity,
    addCapturedFrame,
    cameraReady,
    confirmStoredCapture,
    frames.length,
    playMotionAid,
    project,
    readyFile,
    shootingPreferences.autoPreviewEnabled,
    shootingPreferences.countdownSeconds,
    showCaptureFeedback,
  ]);
  takePhotoRef.current = () => void takePhoto();

  const headset = useHeadsetRemote(
    () => takePhotoRef.current(),
    Boolean(project),
  );

  const runExport = async (
    label: string,
    work: (update: ExportUpdate, signal: AbortSignal) => Promise<File>,
    cancellable = true,
  ) => {
    stopActivity();
    const controller = new AbortController();
    exportControllerRef.current = controller;
    setExportCancellable(cancellable);
    setActivity("exporting");
    setProgress({ label, current: 0, total: Math.max(1, frames.length) });
    setMessage("");
    try {
      const file = await work(
        (current, total, progressLabel) =>
          setProgress({
            label: progressLabel ?? `${label} ${current} sur ${total}`,
            current,
            total,
          }),
        controller.signal,
      );
      setShowExports(false);
      const delivery = await deliverPreparedFile(file);
      if (delivery === "needs-action") {
        setReadyFile(file);
        setMessage("Ton fichier est prêt. Choisis maintenant où le garder.");
      } else {
        setMessage("C’est prêt ! Ton fichier est enregistré.");
      }
    } catch (caught) {
      setMessage(
        (caught as { name?: string })?.name === "AbortError"
          ? "Préparation arrêtée. Ton projet est intact."
          : caught instanceof Error
            ? caught.message
            : "Le fichier n’a pas pu être préparé. Ton projet est intact.",
      );
    } finally {
      if (exportControllerRef.current === controller)
        exportControllerRef.current = null;
      setProgress(null);
      setExportCancellable(false);
      setActivity("idle");
    }
  };

  const saveReadyFile = async () => {
    if (!readyFile) return;
    const delivery = await deliverPreparedFile(readyFile, true);
    if (delivery === "cancelled") {
      setMessage("Rien n’a été envoyé. Tu peux réessayer.");
      return;
    }
    setReadyFile(null);
    setMessage("C’est prêt ! Ton fichier est enregistré.");
  };

  const saveFilmTitle = async () => {
    if (!project) return;
    const title = filmTitle.trim().slice(0, 60);
    if (!title) {
      setFilmTitle(project.name);
      setMessage("Le titre précédent est conservé.");
      return;
    }
    if (title === project.name) return;
    try {
      await updateProject({ name: title });
      setFilmTitle(title);
      setMessage("Le titre du film est changé.");
    } catch {
      setFilmTitle(project.name);
      setMessage("Le titre n’a pas pu être changé. L’ancien titre est gardé.");
    }
  };

  const toggleSettingsSection = (section: Exclude<SettingsSection, null>) => {
    const next = settingsSection === section ? null : section;
    setSettingsSection(next);
    if (next)
      window.requestAnimationFrame(() =>
        document
          .getElementById(`settings-${next}`)
          ?.scrollIntoView({ block: "nearest" }),
      );
  };

  if (!project) return null;
  const busy = activity !== "idle";

  return (
    <main className="studio-shell">
      <header className="studio-header">
        <button
          className="icon-button icon-button--light"
          type="button"
          onClick={() => void closeFilm()}
          aria-label="Retour à mes films"
        >
          <RiArrowLeftLine aria-hidden="true" />
        </button>
        <div className="studio-header__title">
          <strong>{project.name}</strong>
          <span>
            {frames.length} photo{frames.length > 1 ? "s" : ""} ·{" "}
            {Math.round(frames.length / project.fps)} s
          </span>
        </div>
        <div className="studio-header__actions">
          {sessionUi}
          <button
            className="header-action"
            type="button"
            onClick={() => setShowExports(true)}
            aria-label="Enregistrer mon travail"
          >
            <RiDownload2Line aria-hidden="true" /> <span>Enregistrer</span>
          </button>
        </div>
      </header>

      <section
        ref={stageRef}
        className={`camera-stage camera-stage--${project.orientation}`}
        aria-label="Caméra et montage"
      >
        <video
          ref={videoRef}
          className="camera-video"
          autoPlay
          muted
          playsInline
          aria-label="Image de la caméra"
          onLoadedMetadata={updateCameraContentRect}
        />
        {cameraError && (
          <div className="camera-message">
            <RiCameraSwitchLine aria-hidden="true" />
            <strong>Je ne vois pas la caméra.</strong>
            <span>{cameraError}</span>
            <button
              type="button"
              onClick={() => setCameraRestart((value) => value + 1)}
            >
              Réessayer
            </button>
          </div>
        )}
        {!cameraReady && !cameraError && (
          <div className="camera-loading">J’allume la caméra…</div>
        )}
        {shootingPreferences.onionOpacity > 0 &&
          !playbackVisible &&
          onionLayers.map(({ frame, opacity }) => {
            return (
              <StoredFrameImage
                key={frame.id}
                className="onion-image"
                frame={frame}
                alt=""
                aria-hidden="true"
                style={{ opacity }}
              />
            );
          })}
        {shootingPreferences.gridEnabled &&
          cameraContentRect &&
          !playbackVisible &&
          !inspectionFrame && (
            <div
              className="camera-grid"
              aria-hidden="true"
              style={cameraContentRect}
            >
              <i />
              <i />
              <i />
              <i />
            </div>
          )}
        <SmoothPlayback
          ref={playbackSurfaceRef}
          loadImage={getFrameImage}
          frameRect={cameraContentRect}
        />
        {inspectionFrame && !playbackVisible && (
          <button
            className="inspection-view"
            type="button"
            onClick={() => setInspectionFrame(null)}
            aria-label="Fermer la photo et revenir à la caméra"
          >
            <StoredFrameImage
              key={inspectionFrame.id}
              className="inspection-image"
              frame={inspectionFrame}
              alt={`Photo ${inspectionFrame.position + 1} en grand`}
            />
            <RiCloseLine aria-hidden="true" />
          </button>
        )}
        {countdown !== null && (
          <div className="countdown" aria-live="assertive">
            {countdown}
          </div>
        )}
        {captureFlash && <div className="camera-flash" aria-hidden="true" />}
        {captureFeedback && (
          <div
            className={`capture-feedback capture-feedback--${captureFeedback}`}
            role="status"
          >
            {captureFeedback === "storing"
              ? "Photo prise — je la range"
              : "Photo rangée ✓"}
          </div>
        )}
        {playbackKind === "compare" && compareLabel && (
          <div className="compare-label">{compareLabel}</div>
        )}

        <div className="stage-tools stage-tools--left">
          <button
            aria-label="Image fantôme"
            className={
              shootingPreferences.onionOpacity > 0
                ? "tool-button tool-button--active"
                : "tool-button"
            }
            type="button"
            onClick={() =>
              void updateShootingPreferences({
                onionOpacity: shootingPreferences.onionOpacity > 0 ? 0 : 0.4,
              })
            }
          >
            <RiGhostLine aria-hidden="true" />
            <span>Image fantôme</span>
          </button>
        </div>
        <div className="stage-tools stage-tools--right">
          <button
            aria-label="Voir mon film"
            className="tool-button"
            type="button"
            onClick={() => void playFilm(frames)}
            disabled={!frames.length || busy}
          >
            <RiPlayFill aria-hidden="true" />
            <span>Voir mon film</span>
          </button>
          <button
            aria-label="Ouvrir les réglages"
            className="tool-button"
            type="button"
            onClick={() => setShowSettings(true)}
          >
            <RiSettings3Line aria-hidden="true" />
            <span>Réglages</span>
          </button>
        </div>

        {activity === "playing" && playbackKind === "aid" ? (
          <>
            <div className="motion-aid-dots" aria-hidden="true">
              {Array.from(
                { length: Math.min(4, frames.length) },
                (_, index) => (
                  <i
                    className={index < previewFrameIndex ? "is-active" : ""}
                    key={index}
                  />
                ),
              )}
            </div>
            <button
              className="motion-aid-skip"
              type="button"
              onClick={stopActivity}
              aria-label="Passer l’aperçu"
              title="Passer"
            >
              <RiSkipForwardFill aria-hidden="true" />
            </button>
          </>
        ) : activity === "playing" ? (
          <button
            className="playback-stop-button"
            type="button"
            onClick={stopActivity}
            aria-label={
              playbackKind === "compare"
                ? "Arrêter la comparaison"
                : "Arrêter le film"
            }
            title="Arrêter"
          >
            <RiStopFill aria-hidden="true" />
          </button>
        ) : (
          <button
            className="capture-button"
            type="button"
            onClick={() => void takePhoto()}
            disabled={!cameraReady || busy || frames.length >= MAX_FRAMES}
            aria-label="Prendre une photo"
            title="Prendre une photo"
          >
            <span className="capture-button__icon">
              <RiCameraFill aria-hidden="true" />
            </span>
          </button>
        )}
        <button
          className="undo-button"
          type="button"
          onClick={() => {
            const last = frames.at(-1);
            if (last) {
              chooseFrame(last.id);
              setTimeout(
                () => void useStomoStore.getState().removeSelectedFrame(),
                0,
              );
            }
          }}
          disabled={!frames.length || busy}
          aria-label="Annuler la dernière photo"
          title="Annuler la dernière photo"
        >
          <RiArrowGoBackLine aria-hidden="true" />
        </button>
        <button
          className="timeline-toggle"
          type="button"
          onClick={() => {
            const nextOpen = !timelineOpen;
            setTimelineOpen(nextOpen);
            if (nextOpen) {
              const last = frames.at(-1);
              if (last) chooseFrame(last.id);
            }
            setInspectionFrame(null);
          }}
          aria-label={
            timelineOpen
              ? "Cacher les photos"
              : `Voir les photos, ${frames.length} photo${frames.length > 1 ? "s" : ""}`
          }
          title={timelineOpen ? "Cacher les photos" : "Voir les photos"}
        >
          <RiListCheck2 aria-hidden="true" />
        </button>

        {timelineOpen && (
          <section className="timeline-panel" aria-label="Frise des photos">
            <button
              className="timeline-panel__close"
              type="button"
              onClick={() => setTimelineOpen(false)}
              aria-label="Fermer la frise des photos"
              title="Fermer la frise"
            >
              <RiCloseLine aria-hidden="true" />
            </button>
            <VirtualTimeline
              frames={frames}
              orientation={project.orientation}
              selectedFrameId={selectedFrame?.id ?? null}
              onOpenFrame={(frame) => {
                chooseFrame(frame.id);
                setInspectionFrame(frame);
                setTimelineOpen(false);
              }}
            />
            <div className="timeline-actions">
              <button
                type="button"
                aria-label="Déplacer la photo à gauche"
                title="À gauche"
                onClick={() => void moveSelectedFrame(-1)}
                disabled={!selectedFrame}
              >
                <RiArrowLeftLine aria-hidden="true" />
                <span>À gauche</span>
              </button>
              <button
                type="button"
                aria-label="Dupliquer la photo"
                title="Dupliquer"
                onClick={() => void duplicateSelectedFrame()}
                disabled={!selectedFrame || frames.length >= MAX_FRAMES}
              >
                <RiFileCopyLine aria-hidden="true" />
                <span>Dupliquer</span>
              </button>
              <button
                type="button"
                aria-label="Supprimer la photo"
                title="Supprimer"
                onClick={() => void removeSelectedFrame()}
                disabled={!selectedFrame}
              >
                <RiDeleteBinLine aria-hidden="true" />
                <span>Supprimer</span>
              </button>
              <button
                type="button"
                aria-label="Déplacer la photo à droite"
                title="À droite"
                onClick={() => void moveSelectedFrame(1)}
                disabled={!selectedFrame}
              >
                <RiArrowRightLine aria-hidden="true" />
                <span>À droite</span>
              </button>
            </div>
          </section>
        )}
      </section>

      {headset.status === "blocked" && (
        <button
          className="headset-reconnect"
          type="button"
          onClick={() => void headset.reconnect()}
        >
          <RiHeadphoneLine aria-hidden="true" /> Touche ici pour reconnecter le
          bouton du casque
        </button>
      )}
      {message && (
        <div className="toast" role="status">
          {message}
          <button
            type="button"
            onClick={() => setMessage("")}
            aria-label="Fermer"
          >
            ×
          </button>
        </div>
      )}

      {showSettings && (
        <Dialog
          title="Réglages"
          onClose={() => {
            setShowSettings(false);
            setSettingsSection(null);
          }}
          wide
        >
          <div className="dialog__content settings-accordions">
            <section className="settings-accordion" id="settings-capture">
              <button
                className="settings-accordion__heading"
                type="button"
                aria-expanded={settingsSection === "capture"}
                onClick={() => toggleSettingsSection("capture")}
              >
                <RiCameraFill aria-hidden="true" />
                <span>
                  <strong>Prendre les photos</strong>
                  <small>Pour tous les films · caméra et repères</small>
                </span>
                {settingsSection === "capture" ? (
                  <RiArrowUpSLine aria-hidden="true" />
                ) : (
                  <RiArrowDownSLine aria-hidden="true" />
                )}
              </button>
              {settingsSection === "capture" && (
                <div className="settings-accordion__panel settings-list">
                  <label>
                    <span>
                      <RiCameraSwitchLine aria-hidden="true" />
                      <strong>Caméra</strong>
                      <small>La même caméra est gardée pour tes films.</small>
                    </span>
                    <select
                      value={shootingPreferences.cameraDeviceId ?? ""}
                      onChange={(event) => {
                        const device = cameraDevices.find(
                          (candidate) =>
                            candidate.deviceId === event.target.value,
                        );
                        const label =
                          device?.label.toLocaleLowerCase("fr") ?? "";
                        void updateShootingPreferences({
                          cameraDeviceId: event.target.value || null,
                          cameraFacing:
                            /back|rear|environment|arrière|dos/.test(label)
                              ? "environment"
                              : "user",
                        });
                      }}
                    >
                      <option value="">Caméra arrière (automatique)</option>
                      {cameraDevices.map((device, index) => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {cameraLabel(device, index)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>
                      <RiTimerLine aria-hidden="true" />
                      <strong>Retardateur</strong>
                      <small>Le temps pour retirer ta main.</small>
                    </span>
                    <select
                      value={shootingPreferences.countdownSeconds}
                      onChange={(event) =>
                        void updateShootingPreferences({
                          countdownSeconds: Number(
                            event.target.value,
                          ) as CountdownSeconds,
                        })
                      }
                    >
                      <option value={0}>Sans retardateur</option>
                      <option value={1}>1 seconde</option>
                      <option value={2}>2 secondes</option>
                      <option value={3}>3 secondes</option>
                      <option value={5}>5 secondes</option>
                    </select>
                  </label>
                  <div className="settings-row">
                    <span>
                      <RiGridLine aria-hidden="true" />
                      <strong>Grille</strong>
                      <small>Aide à placer les objets dans l’image.</small>
                    </span>
                    <button
                      className="settings-toggle"
                      type="button"
                      aria-pressed={shootingPreferences.gridEnabled}
                      onClick={() =>
                        void updateShootingPreferences({
                          gridEnabled: !shootingPreferences.gridEnabled,
                        })
                      }
                    >
                      {shootingPreferences.gridEnabled ? "Oui" : "Non"}
                    </button>
                  </div>
                  {headset.status !== "unsupported" && (
                    <div className="settings-row">
                      <span>
                        <RiHeadphoneLine aria-hidden="true" />
                        <strong>Bouton du casque</strong>
                        <small>
                          {headset.status === "ready"
                            ? "Prêt à prendre une photo."
                            : "Touche le bouton pour l’activer."}
                        </small>
                      </span>
                      <button
                        className="settings-connect-button"
                        type="button"
                        onClick={() => void headset.reconnect()}
                      >
                        {headset.status === "ready" ? "Bouton prêt" : "Activer"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </section>

            <section className="settings-accordion" id="settings-motion">
              <button
                className="settings-accordion__heading"
                type="button"
                aria-expanded={settingsSection === "motion"}
                onClick={() => toggleSettingsSection("motion")}
              >
                <RiGhostLine aria-hidden="true" />
                <span>
                  <strong>Voir le mouvement</strong>
                  <small>Pour tous les films · aperçu et fantômes</small>
                </span>
                {settingsSection === "motion" ? (
                  <RiArrowUpSLine aria-hidden="true" />
                ) : (
                  <RiArrowDownSLine aria-hidden="true" />
                )}
              </button>
              {settingsSection === "motion" && (
                <div className="settings-accordion__panel settings-list">
                  <div className="settings-row">
                    <span>
                      <RiPlayFill aria-hidden="true" />
                      <strong>Aperçu après la photo</strong>
                      <small>
                        Montre les quatre dernières images une fois.
                      </small>
                    </span>
                    <button
                      className="settings-toggle"
                      type="button"
                      aria-pressed={shootingPreferences.autoPreviewEnabled}
                      onClick={() =>
                        void updateShootingPreferences({
                          autoPreviewEnabled:
                            !shootingPreferences.autoPreviewEnabled,
                        })
                      }
                    >
                      {shootingPreferences.autoPreviewEnabled ? "Oui" : "Non"}
                    </button>
                  </div>
                  <div className="settings-row">
                    <span>
                      <RiContrast2Line aria-hidden="true" />
                      <strong>Comparer deux photos</strong>
                      <small>Alterne lentement Avant et Après.</small>
                    </span>
                    <button
                      className="settings-connect-button"
                      type="button"
                      disabled={frames.length < 2 || busy}
                      onClick={() => {
                        setShowSettings(false);
                        setSettingsSection(null);
                        void compareLastPhotos();
                      }}
                    >
                      Comparer
                    </button>
                  </div>
                  <label>
                    <span>
                      <RiGhostLine aria-hidden="true" />
                      <strong>Transparence</strong>
                      <small>Règle la force des images fantômes.</small>
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="0.7"
                      step="0.1"
                      value={shootingPreferences.onionOpacity}
                      onChange={(event) =>
                        void updateShootingPreferences({
                          onionOpacity: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>
                      <RiGhostLine aria-hidden="true" />
                      <strong>Nombre d’images fantômes</strong>
                      <small>Les plus anciennes sont plus légères.</small>
                    </span>
                    <select
                      value={shootingPreferences.onionFrameCount}
                      onChange={(event) =>
                        void updateShootingPreferences({
                          onionFrameCount: Number(
                            event.target.value,
                          ) as OnionFrameCount,
                        })
                      }
                    >
                      {[1, 2, 3].map((count) => (
                        <option key={count} value={count}>
                          {count} image{count > 1 ? "s" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </section>

            <section className="settings-accordion" id="settings-film">
              <button
                className="settings-accordion__heading"
                type="button"
                aria-expanded={settingsSection === "film"}
                onClick={() => toggleSettingsSection("film")}
              >
                <RiFilmLine aria-hidden="true" />
                <span>
                  <strong>Ce film</strong>
                  <small>Titre, sens et vitesse</small>
                </span>
                {settingsSection === "film" ? (
                  <RiArrowUpSLine aria-hidden="true" />
                ) : (
                  <RiArrowDownSLine aria-hidden="true" />
                )}
              </button>
              {settingsSection === "film" && (
                <div className="settings-accordion__panel settings-list">
                  <div className="settings-row settings-title-row">
                    <span>
                      <RiEditLine aria-hidden="true" />
                      <strong>Titre du film</strong>
                      <small>Il apparaît au début du film.</small>
                    </span>
                    <div className="title-editor">
                      <input
                        value={filmTitle}
                        maxLength={60}
                        onChange={(event) => setFilmTitle(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter") return;
                          event.preventDefault();
                          void saveFilmTitle();
                        }}
                        aria-label="Nouveau titre du film"
                      />
                      <button
                        type="button"
                        onClick={() => void saveFilmTitle()}
                      >
                        Changer le titre
                      </button>
                    </div>
                  </div>
                  <label>
                    <span>
                      {project.orientation === "portrait" ? (
                        <RiSmartphoneLine aria-hidden="true" />
                      ) : (
                        <RiLandscapeLine aria-hidden="true" />
                      )}
                      <strong>Sens du film</strong>
                      <small>
                        {frames.length
                          ? "Fixé après la première photo."
                          : "Choisis avant la première photo."}
                      </small>
                    </span>
                    <select
                      value={project.orientation}
                      disabled={frames.length > 0}
                      onChange={(event) => {
                        const orientation = event.target
                          .value as FilmOrientation;
                        void updateProject({
                          orientation,
                          ...FULL_HD[orientation],
                        });
                      }}
                    >
                      <option value="landscape">Paysage</option>
                      <option value="portrait">Vertical</option>
                    </select>
                  </label>
                  <label>
                    <span>
                      <RiSpeedLine aria-hidden="true" />
                      <strong>Vitesse du film</strong>
                      <small>Un grand nombre fait avancer plus vite.</small>
                    </span>
                    <select
                      value={project.fps}
                      onChange={(event) =>
                        void updateProject({
                          fps: Number(event.target.value) as FrameRate,
                        })
                      }
                    >
                      {[4, 6, 8, 10, 12].map((fps) => (
                        <option key={fps} value={fps}>
                          {fps} images par seconde
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </section>
          </div>
        </Dialog>
      )}

      {showExports && (
        <Dialog
          title="Enregistrer mon travail"
          onClose={() => setShowExports(false)}
          wide
        >
          <div className="dialog__content export-grid">
            <button
              type="button"
              className="export-choice export-choice--film"
              disabled={!frames.length || busy || !videoExportAvailable}
              onClick={() =>
                void runExport("Je prépare le film", (update, signal) =>
                  exportVideo(project, frames, update, signal),
                )
              }
            >
              <RiFilmLine aria-hidden="true" />
              <span>
                <strong>Montrer mon film</strong>
                <small>
                  {videoExportAvailable
                    ? "Vidéo Full HD · WebM"
                    : "Vidéo indisponible sur ce navigateur"}
                </small>
              </span>
            </button>
            <button
              type="button"
              className="export-choice export-choice--project"
              disabled={busy}
              onClick={() =>
                void runExport("Je garde le projet", (update, signal) =>
                  exportProject(project, frames, update, signal),
                )
              }
            >
              <RiFolderDownloadLine aria-hidden="true" />
              <span>
                <strong>Garder mon projet</strong>
                <small>Images et réglages · .stomo</small>
              </span>
            </button>
            <button
              className="export-photo-heading"
              type="button"
              aria-expanded={showPhotoExports}
              onClick={() => setShowPhotoExports((shown) => !shown)}
            >
              <RiGalleryLine aria-hidden="true" />
              <span>
                <strong>Récupérer mes photos</strong>
                <small>Une photo ou toute la série</small>
              </span>
              {showPhotoExports ? (
                <RiArrowUpSLine aria-hidden="true" />
              ) : (
                <RiArrowDownSLine aria-hidden="true" />
              )}
            </button>
            {showPhotoExports && (
              <div className="export-photo-options">
                <button
                  type="button"
                  disabled={!selectedFrame || busy}
                  onClick={() =>
                    selectedFrame &&
                    void runExport(
                      "Je prépare la photo",
                      async () => exportSelectedPhoto(project, selectedFrame),
                      false,
                    )
                  }
                >
                  <RiImageDownloadLine aria-hidden="true" />
                  <span>
                    <strong>Cette photo</strong>
                    <small>Image Full HD · JPEG</small>
                  </span>
                </button>
                <button
                  type="button"
                  disabled={!frames.length || busy}
                  onClick={() =>
                    void runExport("Je prépare la photo", (update, signal) =>
                      exportPhotosZip(project, frames, update, signal),
                    )
                  }
                >
                  <RiGalleryLine aria-hidden="true" />
                  <span>
                    <strong>Toutes les photos</strong>
                    <small>Série numérotée · ZIP</small>
                  </span>
                </button>
              </div>
            )}
            <p className="download-help">
              {appleFileDelivery ? (
                <>
                  <RiShareForwardLine aria-hidden="true" /> Tu choisiras où
                  garder ton fichier lorsqu’il sera prêt.
                </>
              ) : (
                <>
                  <RiDownload2Line aria-hidden="true" /> Tes fichiers arrivent
                  dans <strong>Téléchargements</strong> sur le téléphone.
                </>
              )}
            </p>
          </div>
        </Dialog>
      )}

      {progress && (
        <div className="progress-overlay" role="status">
          <RiFilmLine aria-hidden="true" />
          <strong>{progress.label}</strong>
          <progress value={progress.current} max={progress.total} />
          <span>Ton projet reste bien enregistré.</span>
          {exportCancellable && (
            <button
              className="cancel-export-button"
              type="button"
              onClick={() => exportControllerRef.current?.abort()}
            >
              <RiStopFill aria-hidden="true" /> Arrêter la préparation
            </button>
          )}
        </div>
      )}

      {readyFile && (
        <div
          className="progress-overlay ready-file-overlay"
          role="dialog"
          aria-modal="true"
        >
          <RiShareForwardLine aria-hidden="true" />
          <strong>Ton fichier est prêt</strong>
          <span>Choisis où tu veux le garder sur ce téléphone.</span>
          <button
            className="ready-file-button"
            type="button"
            onClick={() => void saveReadyFile()}
          >
            <RiShareForwardLine aria-hidden="true" /> Enregistrer le fichier
          </button>
          <button
            className="ready-file-later"
            type="button"
            onClick={() => {
              setReadyFile(null);
              setMessage(
                "Le fichier n’a pas été enregistré. Ton projet est intact.",
              );
            }}
          >
            Annuler
          </button>
        </div>
      )}
    </main>
  );
}
