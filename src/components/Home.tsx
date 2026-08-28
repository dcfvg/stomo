import {
  RiCameraFill,
  RiDownloadCloud2Line,
  RiFolderVideoLine,
  RiPlayFill,
  RiSparklingFill,
  RiUploadCloud2Line,
} from "@remixicon/react";
import { useRef, useState } from "react";
import { importProject } from "../media/downloads";
import { useStomoStore } from "../state/useStomoStore";
import type { ExportProgress } from "../types";
import { Dialog } from "./Dialog";

export function Home() {
  const { projects, createFilm, openFilm, refreshProjects } = useStomoStore();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const create = async () => {
    setError("");
    try {
      await createFilm(name);
      setShowCreate(false);
      setName("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Le film n’a pas pu être créé.",
      );
    }
  };

  const openSavedProject = async (file?: File) => {
    if (!file) return;
    setError("");
    setProgress({ label: "Ouverture du projet", current: 0, total: 1 });
    try {
      const imported = await importProject(file, (current, total) =>
        setProgress({
          label: `Rangement de la photo ${current} sur ${total}`,
          current,
          total,
        }),
      );
      await refreshProjects();
      await openFilm(imported.project.id);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Ce projet n’a pas pu être ouvert.",
      );
    } finally {
      setProgress(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  return (
    <main className="home-shell">
      <section className="home-intro">
        <p className="eyebrow">Mes films</p>
        <h1>Quelle histoire vas-tu faire bouger&nbsp;?</h1>
        <p>Choisis un film ou commence une toute nouvelle aventure.</p>
      </section>
      <section className="project-grid" aria-label="Mes films">
        <button
          className="new-project-card"
          type="button"
          onClick={() => setShowCreate(true)}
        >
          <span className="camera-bubble" aria-hidden="true">
            <RiCameraFill size={38} />
          </span>
          <strong>Nouveau film</strong>
          <span>Prends ta première photo</span>
        </button>
        {projects.map((project, index) => (
          <article className="project-card" key={project.id}>
            <div
              className={`project-cover project-cover--${index % 2 ? "cyan" : "coral"}`}
            >
              <RiFolderVideoLine size={50} aria-hidden="true" />
              <span>
                {project.frameCount} photo{project.frameCount > 1 ? "s" : ""}
              </span>
            </div>
            <div className="project-card__body">
              <div>
                <strong>{project.name}</strong>
                <span>
                  {project.frameCount
                    ? `${Math.max(1, Math.round(project.frameCount / project.fps))} secondes`
                    : "Prêt à commencer"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => void openFilm(project.id)}
                aria-label={`Continuer ${project.name}`}
              >
                <RiPlayFill size={24} aria-hidden="true" />
              </button>
            </div>
          </article>
        ))}
      </section>
      <section className="home-tools">
        <input
          ref={fileInput}
          type="file"
          accept=".stomo,application/x-stomo,application/zip"
          hidden
          onChange={(event) => void openSavedProject(event.target.files?.[0])}
        />
        <button
          className="secondary-button"
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={Boolean(progress)}
        >
          <RiUploadCloud2Line aria-hidden="true" /> Ouvrir un projet sauvegardé
        </button>
        <p>
          <RiDownloadCloud2Line aria-hidden="true" /> Tes films restent dans ce
          téléphone, même sans internet.
        </p>
      </section>
      {error && (
        <div className="toast toast--error" role="alert">
          {error}
        </div>
      )}

      {showCreate && (
        <Dialog title="Mon nouveau film" onClose={() => setShowCreate(false)}>
          <div className="dialog__content">
            <div className="create-illustration">
              <RiSparklingFill aria-hidden="true" />
              <RiCameraFill aria-hidden="true" />
            </div>
            <label>
              Comment s’appelle ton film&nbsp;?
              <input
                autoFocus
                value={name}
                maxLength={60}
                placeholder="Par exemple : La fusée"
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && void create()}
              />
            </label>
            {error && <p className="form-error">{error}</p>}
            <button
              className="primary-button"
              type="button"
              onClick={() => void create()}
            >
              Créer mon film
            </button>
          </div>
        </Dialog>
      )}

      {progress && (
        <div className="progress-overlay" role="status">
          <RiUploadCloud2Line aria-hidden="true" />
          <strong>{progress.label}</strong>
          <progress value={progress.current} max={progress.total} />
          <span>Ne ferme pas Stomo.</span>
        </div>
      )}
    </main>
  );
}
