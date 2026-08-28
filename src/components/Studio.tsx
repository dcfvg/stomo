import {
  RiArrowGoBackLine,
  RiArrowLeftLine,
  RiArrowRightLine,
  RiCameraFill,
  RiCameraSwitchLine,
  RiDeleteBinLine,
  RiDownload2Line,
  RiFileCopyLine,
  RiFilmLine,
  RiFolderDownloadLine,
  RiGalleryLine,
  RiGhostLine,
  RiGridLine,
  RiImageDownloadLine,
  RiListCheck2,
  RiPauseFill,
  RiPlayFill,
  RiSettings3Line,
  RiSpeedLine,
  RiTimerLine,
} from "@remixicon/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  exportPhotosZip,
  exportProject,
  exportSelectedPhoto,
  exportVideo,
} from "../media/downloads";
import { captureVideoFrame } from "../media/images";
import { useStomoStore } from "../state/useStomoStore";
import type {
  CountdownSeconds,
  ExportProgress,
  FrameRate,
  FrameRecord,
} from "../types";
import { BlobImage } from "./BlobImage";
import { Dialog } from "./Dialog";

type StudioActivity =
  | "idle"
  | "countdown"
  | "capturing"
  | "playing"
  | "exporting";
const wait = (duration: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, duration));

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
  const operationToken = useRef(0);
  const [cameraRestart, setCameraRestart] = useState(0);
  const [cameraError, setCameraError] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [activity, setActivity] = useState<StudioActivity>("idle");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [playbackFrame, setPlaybackFrame] = useState<FrameRecord | null>(null);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showExports, setShowExports] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [message, setMessage] = useState("");

  const selectedFrame = useMemo(
    () => frames.find((frame) => frame.id === selectedFrameId) ?? frames.at(-1),
    [frames, selectedFrameId],
  );
  const onionFrame = frames.at(-1);
  const projectId = project?.id;
  const cameraFacing = project?.cameraFacing;

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraReady(false);
  }, []);

  const stopActivity = useCallback(() => {
    operationToken.current += 1;
    setCountdown(null);
    setPlaybackFrame(null);
    setActivity("idle");
  }, []);

  useEffect(() => {
    if (!projectId || !cameraFacing) return;
    let disposed = false;
    const startCamera = async () => {
      stopCamera();
      setCameraError("");
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError(
          "Cette version de Chrome ne donne pas accès à la caméra ici.",
        );
        return;
      }
      const preferred: MediaStreamConstraints = {
        audio: false,
        video: {
          facingMode: { ideal: cameraFacing },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          aspectRatio: { ideal: 16 / 9 },
        },
      };
      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia(preferred);
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              facingMode: cameraFacing,
              width: { ideal: 640 },
              height: { ideal: 480 },
            },
          });
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
  }, [cameraFacing, cameraRestart, projectId, stopCamera]);

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

  const play = useCallback(
    async (
      sequence: FrameRecord[],
      loops: number,
      token = ++operationToken.current,
    ) => {
      if (!project || !sequence.length) return;
      setActivity("playing");
      for (let loop = 0; loop < loops; loop += 1) {
        for (const frame of sequence) {
          if (operationToken.current !== token) return;
          setPlaybackFrame(frame);
          await wait(1000 / project.fps);
        }
      }
      if (operationToken.current === token) {
        setPlaybackFrame(null);
        setActivity("idle");
      }
    },
    [project],
  );

  const takePhoto = async () => {
    if (!project || !videoRef.current || !cameraReady || activity !== "idle")
      return;
    if (frames.length >= 240)
      return setMessage(
        "Ton film a déjà 240 photos. Tu peux en supprimer avant de continuer.",
      );
    const token = ++operationToken.current;
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
    try {
      const captured = await captureVideoFrame(videoRef.current);
      if (operationToken.current !== token) return;
      await addCapturedFrame(captured);
      navigator.vibrate?.([45, 40, 80]);
      const updatedFrames = useStomoStore.getState().frames;
      await play(
        updatedFrames.slice(-project.autoPreviewFrames),
        project.autoPreviewLoops,
        token,
      );
      if (updatedFrames.length === 220)
        setMessage(
          "Ton film contient 220 photos. Il reste de la place pour 20 photos.",
        );
    } catch (caught) {
      setActivity("idle");
      setMessage(
        caught instanceof Error
          ? caught.message
          : "La photo n’a pas pu être prise.",
      );
    }
  };

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

      <section className="camera-stage" aria-label="Caméra et montage">
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
        {onionFrame && project.onionOpacity > 0 && !playbackFrame && (
          <BlobImage
            key={onionFrame.id}
            className="onion-image"
            blob={onionFrame.image}
            alt="Dernière photo en transparence"
            style={{ opacity: project.onionOpacity }}
          />
        )}
        {project.gridEnabled && (
          <div className="camera-grid" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </div>
        )}
        {playbackFrame && (
          <BlobImage
            key={playbackFrame.id}
            className="playback-image"
            blob={playbackFrame.image}
            alt="Lecture du film"
          />
        )}
        {countdown !== null && (
          <div className="countdown" aria-live="assertive">
            {countdown}
          </div>
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
            onClick={() => void play(frames, 1)}
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

        {activity === "playing" ? (
          <button
            className="capture-button capture-button--stop"
            type="button"
            onClick={stopActivity}
          >
            <RiPauseFill aria-hidden="true" />
            <span>Arrêter le film</span>
          </button>
        ) : (
          <button
            className="capture-button"
            type="button"
            onClick={() => void takePhoto()}
            disabled={!cameraReady || busy || frames.length >= 240}
          >
            <span className="capture-button__icon">
              <RiCameraFill aria-hidden="true" />
            </span>
            <span>Prendre une photo</span>
          </button>
        )}
        <button
          className="timeline-toggle"
          type="button"
          onClick={() => setTimelineOpen((open) => !open)}
        >
          <RiListCheck2 aria-hidden="true" />{" "}
          {timelineOpen
            ? "Cacher les photos"
            : `Voir les photos (${frames.length})`}
        </button>

        {timelineOpen && (
          <section className="timeline-panel" aria-label="Frise des photos">
            <div className="timeline-list">
              {frames.length ? (
                frames.map((frame) => (
                  <button
                    className={
                      frame.id === selectedFrame?.id
                        ? "timeline-frame timeline-frame--selected"
                        : "timeline-frame"
                    }
                    type="button"
                    key={frame.id}
                    onClick={() => chooseFrame(frame.id)}
                  >
                    <BlobImage
                      blob={frame.thumbnail}
                      alt={`Photo ${frame.position + 1}`}
                    />
                    <span>{frame.position + 1}</span>
                  </button>
                ))
              ) : (
                <p>Ta première photo apparaîtra ici.</p>
              )}
            </div>
            <div className="timeline-actions">
              <button
                type="button"
                onClick={() => void moveSelectedFrame(-1)}
                disabled={!selectedFrame}
              >
                <RiArrowLeftLine aria-hidden="true" />
                <span>À gauche</span>
              </button>
              <button
                type="button"
                onClick={() => void duplicateSelectedFrame()}
                disabled={!selectedFrame || frames.length >= 240}
              >
                <RiFileCopyLine aria-hidden="true" />
                <span>Dupliquer</span>
              </button>
              <button
                type="button"
                onClick={() => void removeSelectedFrame()}
                disabled={!selectedFrame}
              >
                <RiDeleteBinLine aria-hidden="true" />
                <span>Supprimer</span>
              </button>
              <button
                type="button"
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

      <div className="quick-bar">
        <button
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
        >
          <RiArrowGoBackLine aria-hidden="true" /> Annuler la dernière photo
        </button>
        <span>
          <RiTimerLine aria-hidden="true" /> Retardateur :{" "}
          {project.countdownSeconds
            ? `${project.countdownSeconds} seconde${project.countdownSeconds > 1 ? "s" : ""}`
            : "sans"}
        </span>
        <span>
          <RiSpeedLine aria-hidden="true" /> Vitesse : {project.fps} images par
          seconde
        </span>
      </div>
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
                <option value={3}>3 secondes</option>
                <option value={5}>5 secondes</option>
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
                <small>La dernière photo aide à placer les objets.</small>
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
            <button
              className="secondary-button"
              type="button"
              onClick={() =>
                void updateProject({
                  cameraFacing:
                    project.cameraFacing === "environment"
                      ? "user"
                      : "environment",
                })
              }
            >
              <RiCameraSwitchLine aria-hidden="true" /> Changer de caméra
            </button>
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
                <small>Une image JPEG</small>
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
                <small>Un film WebM muet</small>
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
                <small>Un fichier .stomo à reprendre</small>
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
