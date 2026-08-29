import {
  RiArrowGoBackLine,
  RiArrowLeftLine,
  RiArrowRightLine,
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
  RiSkipLeftLine,
  RiSkipRightLine,
  RiPlayFill,
  RiCloseLine,
  RiSettings3Line,
  RiSkipForwardFill,
  RiSmartphoneLine,
  RiSpeedLine,
  RiStopFill,
  RiTimerLine,
} from "@remixicon/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  exportPhotosZip,
  exportProject,
  exportSelectedPhoto,
  exportVideo,
} from "../media/downloads";
import { cameraSecurityMessage, requestCameraStream } from "../media/camera";
import { captureVideoFrame, FULL_HD } from "../media/images";
import { useHeadsetRemote } from "../media/useHeadsetRemote";
import { buildOnionLayers } from "../media/onion";
import { playFramesInLoop } from "../media/playback";
import { useStomoStore } from "../state/useStomoStore";
import { FRAME_WARNING, MAX_FRAMES, MAX_TIMELINE_THUMBNAILS } from "../config";
import { getFrameImage } from "../storage/database";
import type {
  AutoPreviewLoops,
  CountdownSeconds,
  ExportProgress,
  FilmOrientation,
  FrameRate,
  FrameSummary,
  OnionFrameCount,
} from "../types";
import { Dialog } from "./Dialog";
import { SmoothPlayback, type SmoothPlaybackHandle } from "./SmoothPlayback";
import { StoredFrameImage } from "./StoredFrameImage";
import { FrameThumbnail } from "./FrameThumbnail";

type StudioActivity =
  | "idle"
  | "countdown"
  | "capturing"
  | "playing"
  | "exporting";
type PlaybackKind = "film" | "aid" | "compare" | null;

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

export function Studio() {
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
    chooseFrame,
  } = useStomoStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const playbackSurfaceRef = useRef<SmoothPlaybackHandle>(null);
  const operationToken = useRef(0);
  const captureRequestPending = useRef(false);
  const flashTimer = useRef<number | null>(null);
  const feedbackTimer = useRef<number | null>(null);
  const lowerResolutionNotified = useRef(false);
  const takePhotoRef = useRef<() => void>(() => undefined);
  const [cameraRestart, setCameraRestart] = useState(0);
  const [cameraError, setCameraError] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [activity, setActivity] = useState<StudioActivity>("idle");
  const [playbackKind, setPlaybackKind] = useState<PlaybackKind>(null);
  const [previewPass, setPreviewPass] = useState(0);
  const [compareLabel, setCompareLabel] = useState<"Avant" | "Après" | null>(
    null,
  );
  const [countdown, setCountdown] = useState<number | null>(null);
  const [captureFlash, setCaptureFlash] = useState(false);
  const [captureFeedback, setCaptureFeedback] = useState(false);
  const [playbackVisible, setPlaybackVisible] = useState(false);
  const [inspectionFrame, setInspectionFrame] = useState<FrameSummary | null>(
    null,
  );
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [timelineStart, setTimelineStart] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showExports, setShowExports] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [message, setMessage] = useState("");
  const [filmTitle, setFilmTitle] = useState(
    () => useStomoStore.getState().project?.name ?? "",
  );

  const selectedFrame = useMemo(
    () => frames.find((frame) => frame.id === selectedFrameId) ?? frames.at(-1),
    [frames, selectedFrameId],
  );
  const onionLayers = project
    ? buildOnionLayers(frames, project.onionFrameCount, project.onionOpacity)
    : [];
  const visibleTimelineFrames = useMemo(
    () => frames.slice(timelineStart, timelineStart + MAX_TIMELINE_THUMBNAILS),
    [frames, timelineStart],
  );
  const projectId = project?.id;
  const cameraFacing = project?.cameraFacing;
  const cameraDeviceId = project?.cameraDeviceId;

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
    setPreviewPass(0);
    setCompareLabel(null);
    setCaptureFlash(false);
    setCaptureFeedback(false);
    setActivity("idle");
  }, []);

  const showCaptureFeedback = useCallback(() => {
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    if (feedbackTimer.current !== null)
      window.clearTimeout(feedbackTimer.current);
    setCaptureFlash(true);
    setCaptureFeedback(true);
    flashTimer.current = window.setTimeout(() => {
      flashTimer.current = null;
      setCaptureFlash(false);
    }, 140);
  }, []);

  const finishCaptureFeedback = useCallback(() => {
    if (feedbackTimer.current !== null)
      window.clearTimeout(feedbackTimer.current);
    feedbackTimer.current = window.setTimeout(() => {
      feedbackTimer.current = null;
      setCaptureFeedback(false);
    }, 700);
  }, []);

  useEffect(() => {
    document.body.classList.add("studio-open");
    return () => {
      document.body.classList.remove("studio-open");
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
      if (feedbackTimer.current !== null)
        window.clearTimeout(feedbackTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!projectId || !cameraFacing) return;
    let disposed = false;
    const startCamera = async () => {
      stopCamera();
      setCameraError("");
      const securityMessage = cameraSecurityMessage();
      if (securityMessage) {
        setCameraError(securityMessage);
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError(
          "Cette version de Chrome ne donne pas accès à la caméra ici.",
        );
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
          void updateProject({ cameraDeviceId: null }, false);
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
          void updateProject({ cameraDeviceId: activeDeviceId }, false);
        setCameraReady(true);
      } catch {
        setCameraError(
          "La caméra est bloquée. Autorise-la dans Chrome, puis réessaie.",
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
    updateProject,
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
        await playFramesInLoop({
          frames: sequence,
          fps: project.fps,
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
    async (
      sequence: FrameSummary[],
      loops: AutoPreviewLoops,
      token: number,
    ) => {
      if (!sequence.length || loops === 0) {
        if (operationToken.current === token) setActivity("idle");
        return;
      }
      const surface = playbackSurfaceRef.current;
      if (!surface) return;
      setActivity("playing");
      setPlaybackKind("aid");
      try {
        await surface.preload(sequence);
        for (let loop = 0; loop < loops; loop += 1) {
          setPreviewPass(loop + 1);
          for (let index = 0; index < sequence.length; index += 1) {
            if (operationToken.current !== token) return;
            await surface.show(sequence[index]);
            if (operationToken.current !== token) return;
            setPlaybackVisible(true);
            await wait(index === sequence.length - 1 ? 650 : 250);
          }
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
          "La mémoire du téléphone est presque pleine. Enregistre ton projet avant de continuer.",
        );
        return;
      }
      const token = ++operationToken.current;
      setInspectionFrame(null);
      setMessage("");
      setActivity("countdown");
      for (let number = project.countdownSeconds; number > 0; number -= 1) {
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
      finishCaptureFeedback();
      navigator.vibrate?.([45, 40, 80]);
      if (captured.sourceBelowFullHd && !lowerResolutionNotified.current) {
        lowerResolutionNotified.current = true;
        setMessage(
          "La caméra fournit une image moins précise, Stomo l’adapte en Full HD.",
        );
      }
      const updatedFrames = useStomoStore.getState().frames;
      if (timelineOpen)
        setTimelineStart(
          Math.max(0, updatedFrames.length - MAX_TIMELINE_THUMBNAILS),
        );
      await playMotionAid(
        updatedFrames.slice(-project.autoPreviewFrames),
        project.autoPreviewLoops,
        token,
      );
      if (updatedFrames.length === FRAME_WARNING)
        setMessage(
          `Ton film contient ${FRAME_WARNING} photos. Il reste de la place pour ${MAX_FRAMES - FRAME_WARNING} photos.`,
        );
    } catch (caught) {
      setActivity("idle");
      setCaptureFlash(false);
      setCaptureFeedback(false);
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
    frames.length,
    finishCaptureFeedback,
    playMotionAid,
    project,
    showCaptureFeedback,
    timelineOpen,
  ]);
  takePhotoRef.current = () => void takePhoto();

  const headset = useHeadsetRemote(
    () => takePhotoRef.current(),
    Boolean(project),
  );

  const runExport = async (
    label: string,
    work: (update: (current: number, total: number) => void) => Promise<void>,
  ) => {
    stopActivity();
    setActivity("exporting");
    setProgress({ label, current: 0, total: Math.max(1, frames.length) });
    setMessage("");
    try {
      await work((current, total) =>
        setProgress({
          label: `${label} ${current} sur ${total}`,
          current,
          total,
        }),
      );
      setShowExports(false);
      setMessage("C’est prêt ! Le fichier est dans Téléchargements.");
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : "Le fichier n’a pas pu être préparé. Ton projet est intact.",
      );
    } finally {
      setProgress(null);
      setActivity("idle");
    }
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
        <div>
          <strong>{project.name}</strong>
          <span>
            {frames.length} photo{frames.length > 1 ? "s" : ""} ·{" "}
            {Math.round(frames.length / project.fps)} s
          </span>
        </div>
        <button
          className="header-action"
          type="button"
          onClick={() => setShowExports(true)}
        >
          <RiDownload2Line aria-hidden="true" /> Enregistrer
        </button>
      </header>

      <section
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
        {project.onionOpacity > 0 &&
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
        {project.gridEnabled && (
          <div className="camera-grid" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </div>
        )}
        <SmoothPlayback ref={playbackSurfaceRef} loadImage={getFrameImage} />
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
          <div className="capture-feedback" role="status">
            Photo prise — je la range
          </div>
        )}
        {playbackKind === "compare" && compareLabel && (
          <div className="compare-label">{compareLabel}</div>
        )}

        <div className="stage-tools stage-tools--left">
          <button
            aria-label="Image fantôme"
            className={
              project.onionOpacity > 0
                ? "tool-button tool-button--active"
                : "tool-button"
            }
            type="button"
            onClick={() =>
              void updateProject({
                onionOpacity: project.onionOpacity > 0 ? 0 : 0.4,
              })
            }
          >
            <RiGhostLine aria-hidden="true" />
            <span>Image fantôme</span>
          </button>
          <button
            aria-label="Afficher ou cacher la grille"
            className={
              project.gridEnabled
                ? "tool-button tool-button--active"
                : "tool-button"
            }
            type="button"
            onClick={() =>
              void updateProject({ gridEnabled: !project.gridEnabled })
            }
          >
            <RiGridLine aria-hidden="true" />
            <span>Grille</span>
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
            aria-label="Comparer les deux dernières photos"
            className="tool-button"
            type="button"
            onClick={() => void compareLastPhotos()}
            disabled={frames.length < 2 || busy}
          >
            <RiContrast2Line aria-hidden="true" />
            <span>Comparer</span>
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
          <button
            className="capture-button capture-button--stop capture-button--replay"
            type="button"
            onClick={stopActivity}
            aria-label={`Relecture ${previewPass} sur ${project.autoPreviewLoops}. Passer.`}
          >
            <RiSkipForwardFill aria-hidden="true" />
            <span className="replay-status" aria-hidden="true">
              <small>Relecture</small>
              <i>
                {Array.from(
                  { length: project.autoPreviewLoops },
                  (_, index) => (
                    <b
                      className={index < previewPass ? "is-done" : ""}
                      key={index}
                    />
                  ),
                )}
              </i>
            </span>
            <span>Passer</span>
          </button>
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
              setTimelineStart(
                Math.max(0, frames.length - MAX_TIMELINE_THUMBNAILS),
              );
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
            <div className="timeline-list">
              {frames.length ? (
                <>
                  {timelineStart > 0 && (
                    <button
                      className="timeline-page"
                      type="button"
                      aria-label="Voir les photos précédentes"
                      title="Photos précédentes"
                      onClick={() =>
                        setTimelineStart((start) =>
                          Math.max(0, start - MAX_TIMELINE_THUMBNAILS + 6),
                        )
                      }
                    >
                      <RiSkipLeftLine aria-hidden="true" />
                    </button>
                  )}
                  {visibleTimelineFrames.map((frame) => (
                    <button
                      className={
                        frame.id === selectedFrame?.id
                          ? "timeline-frame timeline-frame--selected"
                          : "timeline-frame"
                      }
                      type="button"
                      key={frame.id}
                      onClick={() => {
                        chooseFrame(frame.id);
                        setInspectionFrame(frame);
                        setTimelineOpen(false);
                      }}
                    >
                      <FrameThumbnail
                        frame={frame}
                        alt={`Photo ${frame.position + 1}`}
                      />
                      <span>{frame.position + 1}</span>
                    </button>
                  ))}
                  {timelineStart + MAX_TIMELINE_THUMBNAILS < frames.length && (
                    <button
                      className="timeline-page"
                      type="button"
                      aria-label="Voir les photos suivantes"
                      title="Photos suivantes"
                      onClick={() =>
                        setTimelineStart((start) =>
                          Math.min(
                            Math.max(
                              0,
                              frames.length - MAX_TIMELINE_THUMBNAILS,
                            ),
                            start + MAX_TIMELINE_THUMBNAILS - 6,
                          ),
                        )
                      }
                    >
                      <RiSkipRightLine aria-hidden="true" />
                    </button>
                  )}
                </>
              ) : (
                <p>Ta première photo apparaîtra ici.</p>
              )}
            </div>
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
        <Dialog title="Réglages du film" onClose={() => setShowSettings(false)}>
          <div className="dialog__content settings-list">
            <div className="settings-row settings-title-row">
              <span>
                <RiEditLine aria-hidden="true" />
                <strong>Titre du film</strong>
                <small>Donne un nom facile à reconnaître.</small>
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
                <button type="button" onClick={() => void saveFilmTitle()}>
                  Changer le titre
                </button>
              </div>
            </div>
            <label>
              <span>
                <RiCameraSwitchLine aria-hidden="true" />
                <strong>Caméra</strong>
                <small>La caméra arrière est choisie au début.</small>
              </span>
              <select
                value={project.cameraDeviceId ?? ""}
                onChange={(event) => {
                  const device = cameraDevices.find(
                    (candidate) => candidate.deviceId === event.target.value,
                  );
                  const label = device?.label.toLocaleLowerCase("fr") ?? "";
                  void updateProject({
                    cameraDeviceId: event.target.value || null,
                    cameraFacing: /back|rear|environment|arrière|dos/.test(
                      label,
                    )
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
                <RiHeadphoneLine aria-hidden="true" />
                <strong>Bouton du casque</strong>
                <small>
                  {headset.status === "ready"
                    ? "Prêt à prendre une photo."
                    : headset.status === "unsupported"
                      ? "Non disponible dans ce navigateur."
                      : "Touche le bouton pour l’activer."}
                </small>
              </span>
              <button
                className="settings-connect-button"
                type="button"
                disabled={headset.status === "unsupported"}
                onClick={() => void headset.reconnect()}
              >
                {headset.status === "ready" ? "Bouton prêt" : "Activer"}
              </button>
            </label>
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
                    ? "Le sens est fixé après la première photo."
                    : "Choisis avant de prendre la première photo."}
                </small>
              </span>
              <select
                value={project.orientation}
                disabled={frames.length > 0}
                onChange={(event) => {
                  const orientation = event.target.value as FilmOrientation;
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
                <RiTimerLine aria-hidden="true" />
                <strong>Retardateur</strong>
                <small>Le temps pour retirer ta main.</small>
              </span>
              <select
                value={project.countdownSeconds}
                onChange={(event) =>
                  void updateProject({
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
            <label>
              <span>
                <RiPlayFill aria-hidden="true" />
                <strong>Aide après chaque photo</strong>
                <small>Rejoue doucement les 6 dernières photos.</small>
              </span>
              <select
                value={project.autoPreviewLoops}
                onChange={(event) =>
                  void updateProject({
                    autoPreviewLoops: Number(
                      event.target.value,
                    ) as AutoPreviewLoops,
                  })
                }
              >
                <option value={0}>Ne pas rejouer</option>
                {[1, 2, 3, 4].map((loops) => (
                  <option key={loops} value={loops}>
                    {loops} passage{loops > 1 ? "s" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>
                <RiSpeedLine aria-hidden="true" />
                <strong>Vitesse du film</strong>
                <small>Plus le nombre est grand, plus le film va vite.</small>
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
            <label>
              <span>
                <RiGhostLine aria-hidden="true" />
                <strong>Image fantôme</strong>
                <small>Les dernières photos aident à placer les objets.</small>
              </span>
              <input
                type="range"
                min="0"
                max="0.7"
                step="0.1"
                value={project.onionOpacity}
                onChange={(event) =>
                  void updateProject({
                    onionOpacity: Number(event.target.value),
                  })
                }
              />
            </label>
            <label>
              <span>
                <RiGhostLine aria-hidden="true" />
                <strong>Nombre d’images fantômes</strong>
                <small>Les plus anciennes deviennent plus légères.</small>
              </span>
              <select
                value={project.onionFrameCount}
                onChange={(event) =>
                  void updateProject({
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
              disabled={!selectedFrame || busy}
              onClick={() =>
                selectedFrame &&
                void runExport("Préparation de la photo", async () =>
                  exportSelectedPhoto(project, selectedFrame),
                )
              }
            >
              <RiImageDownloadLine aria-hidden="true" />
              <span>
                <strong>Enregistrer cette photo</strong>
                <small>Une image JPEG en Full HD</small>
              </span>
            </button>
            <button
              type="button"
              disabled={!frames.length || busy}
              onClick={() =>
                void runExport("Préparation de la photo", (update) =>
                  exportPhotosZip(project, frames, update),
                )
              }
            >
              <RiGalleryLine aria-hidden="true" />
              <span>
                <strong>Enregistrer toutes les photos</strong>
                <small>Un dossier compressé ZIP</small>
              </span>
            </button>
            <button
              type="button"
              disabled={!frames.length || busy}
              onClick={() =>
                void runExport("Préparation de la vidéo", (update) =>
                  exportVideo(project, frames, update),
                )
              }
            >
              <RiFilmLine aria-hidden="true" />
              <span>
                <strong>Enregistrer la vidéo</strong>
                <small>Un film WebM muet en Full HD</small>
              </span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void runExport("Sauvegarde de la photo", (update) =>
                  exportProject(project, frames, update),
                )
              }
            >
              <RiFolderDownloadLine aria-hidden="true" />
              <span>
                <strong>Sauvegarder ce projet</strong>
                <small>Images et réglages dans un fichier .stomo</small>
              </span>
            </button>
            <p className="download-help">
              <RiDownload2Line aria-hidden="true" /> Tes fichiers arrivent dans{" "}
              <strong>Téléchargements</strong> sur le téléphone.
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
        </div>
      )}
    </main>
  );
}
