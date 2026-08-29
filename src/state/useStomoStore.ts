import { create } from "zustand";
import {
  addFrame,
  createProject,
  deleteFrame,
  duplicateFrame,
  getFrameImage,
  getProject,
  listFrames,
  listProjects,
  moveFrame,
  saveProject,
  updateFrameThumbnail,
} from "../storage/database";
import { createThumbnail, loadBlobImage } from "../media/images";
import type { FilmOrientation, FrameSummary, ProjectRecord } from "../types";

interface CapturedFrame {
  image: Blob;
  thumbnail: Blob;
  width: number;
  height: number;
}

interface StomoState {
  projects: ProjectRecord[];
  project: ProjectRecord | null;
  frames: FrameSummary[];
  selectedFrameId: string | null;
  loading: boolean;
  notice: string | null;
  initialize: () => Promise<void>;
  createFilm: (name: string, orientation: FilmOrientation) => Promise<void>;
  openFilm: (id: string) => Promise<void>;
  closeFilm: () => Promise<void>;
  addCapturedFrame: (captured: CapturedFrame) => Promise<FrameSummary>;
  removeSelectedFrame: () => Promise<void>;
  duplicateSelectedFrame: () => Promise<void>;
  moveSelectedFrame: (direction: -1 | 1) => Promise<void>;
  updateProject: (
    patch: Partial<ProjectRecord>,
    markModified?: boolean,
  ) => Promise<void>;
  chooseFrame: (id: string) => void;
  setNotice: (notice: string | null) => void;
  refreshProjects: () => Promise<void>;
}

async function reloadFilm(projectId: string) {
  const [project, frames] = await Promise.all([
    getProject(projectId),
    listFrames(projectId),
  ]);
  if (!project) throw new Error("Ce film n’existe plus.");
  return { project, frames };
}

async function repairThumbnails(
  project: ProjectRecord,
  frames: FrameSummary[],
  update: (recipe: (state: StomoState) => Partial<StomoState>) => void,
) {
  for (const frame of frames) {
    try {
      if (!frame.thumbnailNeedsRepair) await loadBlobImage(frame.thumbnail);
      else throw new Error("Vignette manquante");
    } catch {
      try {
        const thumbnail = await createThumbnail(
          await getFrameImage(frame.id),
          project.orientation,
        );
        await updateFrameThumbnail(frame.id, thumbnail);
        update((state) =>
          state.project?.id === project.id
            ? {
                frames: state.frames.map((candidate) =>
                  candidate.id === frame.id
                    ? {
                        ...candidate,
                        thumbnail,
                        thumbnailNeedsRepair: false,
                      }
                    : candidate,
                ),
              }
            : {},
        );
      } catch {
        // L’image originale reste utilisée comme vignette de secours.
      }
    }
  }
}

export const useStomoStore = create<StomoState>((set, get) => ({
  projects: [],
  project: null,
  frames: [],
  selectedFrameId: null,
  loading: true,
  notice: null,
  initialize: async () => {
    set({ loading: true });
    const projects = await listProjects();
    set({ projects, loading: false });
  },
  createFilm: async (name, orientation) => {
    const project = await createProject(name, orientation);
    set({
      project,
      frames: [],
      selectedFrameId: null,
      projects: [project, ...get().projects],
    });
  },
  openFilm: async (id) => {
    set({ loading: true });
    const { project, frames } = await reloadFilm(id);
    set({
      project,
      frames,
      selectedFrameId: frames.at(-1)?.id ?? null,
      loading: false,
    });
    await saveProject(project);
    void repairThumbnails(project, frames, set);
  },
  closeFilm: async () => {
    const projects = await listProjects();
    set({ project: null, frames: [], selectedFrameId: null, projects });
  },
  addCapturedFrame: async ({ image, thumbnail, width, height }) => {
    const current = get().project;
    if (!current) throw new Error("Ouvre d’abord un film.");
    const frame = await addFrame(current.id, image, thumbnail, width, height);
    const project = {
      ...current,
      width,
      height,
      frameCount: current.frameCount + 1,
      updatedAt: Date.now(),
    };
    set({
      project,
      frames: [...get().frames, frame],
      selectedFrameId: frame.id,
    });
    return frame;
  },
  removeSelectedFrame: async () => {
    const { project, selectedFrameId } = get();
    if (!project || !selectedFrameId) return;
    await deleteFrame(project.id, selectedFrameId);
    const reloaded = await reloadFilm(project.id);
    const index = get().frames.findIndex(
      (frame) => frame.id === selectedFrameId,
    );
    const next =
      reloaded.frames[
        Math.max(0, Math.min(index - 1, reloaded.frames.length - 1))
      ];
    set({ ...reloaded, selectedFrameId: next?.id ?? null });
  },
  duplicateSelectedFrame: async () => {
    const { project, selectedFrameId } = get();
    if (!project || !selectedFrameId) return;
    await duplicateFrame(project.id, selectedFrameId);
    const reloaded = await reloadFilm(project.id);
    const sourceIndex = reloaded.frames.findIndex(
      (frame) => frame.id === selectedFrameId,
    );
    set({
      ...reloaded,
      selectedFrameId: reloaded.frames[sourceIndex + 1]?.id ?? selectedFrameId,
    });
  },
  moveSelectedFrame: async (direction) => {
    const { project, selectedFrameId } = get();
    if (!project || !selectedFrameId) return;
    await moveFrame(project.id, selectedFrameId, direction);
    set(await reloadFilm(project.id));
  },
  updateProject: async (patch, markModified = true) => {
    const current = get().project;
    if (!current) return;
    const project = {
      ...current,
      ...patch,
      id: current.id,
      ...(current.frameCount > 0
        ? {
            orientation: current.orientation,
            width: current.width,
            height: current.height,
          }
        : {}),
      updatedAt: markModified ? Date.now() : current.updatedAt,
    };
    await saveProject(project);
    set({ project });
  },
  chooseFrame: (selectedFrameId) => set({ selectedFrameId }),
  setNotice: (notice) => set({ notice }),
  refreshProjects: async () => set({ projects: await listProjects() }),
}));
