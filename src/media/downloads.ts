import {
  BlobReader,
  BlobWriter,
  TextReader,
  TextWriter,
  ZipReader,
  ZipWriter,
} from "@zip.js/zip.js";
import { createId } from "../lib/ids";
import {
  addFrame,
  createProject,
  deleteProject,
  getFrameImage,
  getProject,
  listFrames,
  saveProject,
} from "../storage/database";
import type {
  FrameRecord,
  FrameSummary,
  ProjectRecord,
  StomoManifest,
  StomoManifestV2,
} from "../types";
import {
  createThumbnail,
  imageBlobToJpeg,
  normalizeImageToWebp,
} from "./images";
import { framesToWebm } from "./webm";
import { createExportFileSink } from "./exportSink";
import { MAX_FRAMES } from "../config";
import { renderTitleCard } from "./titleCard";

type ExportFrame = FrameSummary | FrameRecord;
export type ExportUpdate = (
  current: number,
  total: number,
  label?: string,
) => void;

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted)
    throw new DOMException("La préparation a été arrêtée.", "AbortError");
}

function imageForFrame(frame: ExportFrame) {
  return "image" in frame && frame.image instanceof Blob
    ? Promise.resolve(frame.image)
    : getFrameImage(frame.id);
}

export function safeFileName(name: string) {
  const cleaned = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return cleaned || "mon-film";
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function exportSelectedPhoto(
  project: ProjectRecord,
  frame: ExportFrame,
) {
  const jpeg = await imageBlobToJpeg(
    await imageForFrame(frame),
    project.width,
    project.height,
  );
  const number = String(frame.position + 1).padStart(3, "0");
  downloadBlob(jpeg, `${safeFileName(project.name)}_${number}.jpg`);
}

function projectInformation(project: ProjectRecord, frameCount: number) {
  return [
    `Film : ${project.name}`,
    `Vitesse : ${project.fps} images par seconde`,
    `Taille : ${project.width} × ${project.height} pixels`,
    `Nombre de photos : ${frameCount}`,
    `Date de l’export : ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" }).format(new Date())}`,
    "",
    "Créé avec Stomo.",
  ].join("\n");
}

export async function buildPhotosZip(
  project: ProjectRecord,
  frames: ExportFrame[],
  onProgress: ExportUpdate,
  signal?: AbortSignal,
) {
  if (!frames.length)
    throw new Error("Prends au moins une photo avant de les enregistrer.");
  const root = `${safeFileName(project.name)}_photos`;
  const writer = new ZipWriter(new BlobWriter("application/zip"));
  try {
    for (let index = 0; index < frames.length; index += 1) {
      throwIfAborted(signal);
      onProgress(index + 1, frames.length);
      const jpeg = await imageBlobToJpeg(
        await imageForFrame(frames[index]),
        project.width,
        project.height,
      );
      await writer.add(
        `${root}/${String(index + 1).padStart(4, "0")}.jpg`,
        new BlobReader(jpeg),
        { level: 0 },
      );
      throwIfAborted(signal);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    await writer.add(
      `${root}/informations.txt`,
      new TextReader(projectInformation(project, frames.length)),
    );
    return await writer.close();
  } catch (error) {
    await writer.close().catch(() => undefined);
    throw error;
  }
}

export async function exportPhotosZip(
  project: ProjectRecord,
  frames: ExportFrame[],
  onProgress: ExportUpdate,
  signal?: AbortSignal,
) {
  const fileName = `${safeFileName(project.name)}_photos.zip`;
  const sink = await createExportFileSink(fileName).catch(() => null);
  if (!sink) {
    const archive = await buildPhotosZip(project, frames, onProgress, signal);
    throwIfAborted(signal);
    downloadBlob(archive, fileName);
    return;
  }
  const root = `${safeFileName(project.name)}_photos`;
  const writer = new ZipWriter(sink.writable);
  try {
    for (let index = 0; index < frames.length; index += 1) {
      throwIfAborted(signal);
      onProgress(index + 1, frames.length);
      const jpeg = await imageBlobToJpeg(
        await imageForFrame(frames[index]),
        project.width,
        project.height,
      );
      await writer.add(
        `${root}/${String(index + 1).padStart(4, "0")}.jpg`,
        new BlobReader(jpeg),
        { level: 0 },
      );
      throwIfAborted(signal);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    await writer.add(
      `${root}/informations.txt`,
      new TextReader(projectInformation(project, frames.length)),
    );
    await writer.close();
    throwIfAborted(signal);
    downloadBlob(await sink.finish(), fileName);
    window.setTimeout(() => void sink.discard(), 60_000);
  } catch (error) {
    await writer.close().catch(() => undefined);
    await sink.discard();
    throw error;
  }
}

export async function exportVideo(
  project: ProjectRecord,
  frames: ExportFrame[],
  onProgress: ExportUpdate,
  signal?: AbortSignal,
) {
  throwIfAborted(signal);
  onProgress(0, frames.length, "J’ajoute le titre");
  const title = await renderTitleCard(
    project.name,
    project.width,
    project.height,
  );
  throwIfAborted(signal);
  const video = await framesToWebm(
    frames,
    project.fps,
    project.width,
    project.height,
    (current, total) =>
      onProgress(current, total, `Je prépare la photo ${current} sur ${total}`),
    async (frame) => {
      const source = await imageForFrame(frame);
      return frame.width === project.width && frame.height === project.height
        ? source
        : normalizeImageToWebp(source, project.width, project.height);
    },
    { leadIn: { image: title, durationMs: 2_000 }, signal },
  );
  throwIfAborted(signal);
  const fileName = `${safeFileName(project.name)}.webm`;
  const sink = await createExportFileSink(fileName).catch(() => null);
  if (!sink) {
    downloadBlob(video, fileName);
    return;
  }
  try {
    const writable = sink.writable.getWriter();
    await writable.write(video);
    await writable.close();
    downloadBlob(await sink.finish(), fileName);
    window.setTimeout(() => void sink.discard(), 60_000);
  } catch (error) {
    await sink.discard();
    throw error;
  }
}

export async function buildProjectArchive(
  project: ProjectRecord,
  frames: ExportFrame[],
  onProgress: ExportUpdate,
  signal?: AbortSignal,
) {
  if (frames.length !== project.frameCount)
    throw new Error(
      "Une photo déclarée manque dans le projet. La sauvegarde est arrêtée.",
    );
  const writer = new ZipWriter(new BlobWriter("application/x-stomo"));
  const imageFiles = frames.map(
    (_, index) => `images/${String(index + 1).padStart(4, "0")}.webp`,
  );
  const thumbnailFiles = frames.map(
    (_, index) => `vignettes/${String(index + 1).padStart(4, "0")}.webp`,
  );
  const manifest: StomoManifestV2 = {
    format: "stomo-project",
    version: 2,
    project: {
      name: project.name,
      fps: project.fps,
      countdownSeconds: project.countdownSeconds,
      onionOpacity: project.onionOpacity,
      onionFrameCount: project.onionFrameCount,
      autoPreviewFrames: project.autoPreviewFrames,
      autoPreviewLoops: project.autoPreviewLoops,
      width: project.width,
      height: project.height,
      gridEnabled: project.gridEnabled,
      cameraFacing: project.cameraFacing,
      cameraDeviceId: project.cameraDeviceId,
      orientation: project.orientation,
    },
    frames: imageFiles.map((imageFile, position) => ({
      imageFile,
      thumbnailFile: thumbnailFiles[position],
      position,
    })),
  };
  try {
    await writer.add(
      "projet.json",
      new TextReader(JSON.stringify(manifest, null, 2)),
    );
    for (let index = 0; index < frames.length; index += 1) {
      throwIfAborted(signal);
      const image = await imageForFrame(frames[index]);
      if (!(image instanceof Blob) || image.size === 0)
        throw new Error(
          `La photo ${index + 1} est vide. La sauvegarde est arrêtée.`,
        );
      onProgress(index + 1, frames.length);
      const thumbnail =
        frames[index].thumbnail instanceof Blob &&
        frames[index].thumbnail.size > 0 &&
        !frames[index].thumbnailNeedsRepair
          ? frames[index].thumbnail
          : await createThumbnail(image, project.orientation);
      await writer.add(imageFiles[index], new BlobReader(image), {
        level: 0,
      });
      await writer.add(thumbnailFiles[index], new BlobReader(thumbnail), {
        level: 0,
      });
      throwIfAborted(signal);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    return await writer.close();
  } catch (error) {
    await writer.close().catch(() => undefined);
    throw error;
  }
}

export async function exportProject(
  project: ProjectRecord,
  frames: ExportFrame[],
  onProgress: ExportUpdate,
  signal?: AbortSignal,
) {
  const fileName = `${safeFileName(project.name)}.stomo`;
  const sink = await createExportFileSink(fileName).catch(() => null);
  if (!sink) {
    const archive = await buildProjectArchive(
      project,
      frames,
      onProgress,
      signal,
    );
    throwIfAborted(signal);
    downloadBlob(archive, fileName);
    return;
  }
  if (frames.length !== project.frameCount)
    throw new Error(
      "Une photo déclarée manque dans le projet. La sauvegarde est arrêtée.",
    );
  const writer = new ZipWriter(sink.writable);
  const imageFiles = frames.map(
    (_, index) => `images/${String(index + 1).padStart(4, "0")}.webp`,
  );
  const thumbnailFiles = frames.map(
    (_, index) => `vignettes/${String(index + 1).padStart(4, "0")}.webp`,
  );
  const manifest: StomoManifestV2 = {
    format: "stomo-project",
    version: 2,
    project: {
      name: project.name,
      fps: project.fps,
      countdownSeconds: project.countdownSeconds,
      onionOpacity: project.onionOpacity,
      onionFrameCount: project.onionFrameCount,
      autoPreviewFrames: project.autoPreviewFrames,
      autoPreviewLoops: project.autoPreviewLoops,
      width: project.width,
      height: project.height,
      gridEnabled: project.gridEnabled,
      cameraFacing: project.cameraFacing,
      cameraDeviceId: project.cameraDeviceId,
      orientation: project.orientation,
    },
    frames: imageFiles.map((imageFile, position) => ({
      imageFile,
      thumbnailFile: thumbnailFiles[position],
      position,
    })),
  };
  try {
    await writer.add(
      "projet.json",
      new TextReader(JSON.stringify(manifest, null, 2)),
    );
    for (let index = 0; index < frames.length; index += 1) {
      throwIfAborted(signal);
      const image = await imageForFrame(frames[index]);
      if (!image.size)
        throw new Error(
          `La photo ${index + 1} est vide. La sauvegarde est arrêtée.`,
        );
      const thumbnail =
        frames[index].thumbnail.size > 0 && !frames[index].thumbnailNeedsRepair
          ? frames[index].thumbnail
          : await createThumbnail(image, project.orientation);
      await writer.add(imageFiles[index], new BlobReader(image), { level: 0 });
      await writer.add(thumbnailFiles[index], new BlobReader(thumbnail), {
        level: 0,
      });
      throwIfAborted(signal);
      onProgress(index + 1, frames.length);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    await writer.close();
    throwIfAborted(signal);
    downloadBlob(await sink.finish(), fileName);
    window.setTimeout(() => void sink.discard(), 60_000);
  } catch (error) {
    await writer.close().catch(() => undefined);
    await sink.discard();
    throw error;
  }
}

function isManifest(value: unknown): value is StomoManifest {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    record.format === "stomo-project" &&
    (record.version === 1 || record.version === 2) &&
    Array.isArray(record.frames)
  );
}

export async function importProject(
  file: File,
  onProgress: (current: number, total: number) => void,
) {
  const reader = new ZipReader(new BlobReader(file));
  let createdId: string | null = null;
  try {
    const entries = await reader.getEntries();
    const manifestEntry = entries.find(
      (entry) => entry.filename === "projet.json",
    );
    if (!manifestEntry || manifestEntry.directory)
      throw new Error("Ce fichier ne contient pas de projet Stomo.");
    const manifestText = await manifestEntry.getData(new TextWriter());
    const manifest: unknown = JSON.parse(manifestText);
    if (!isManifest(manifest))
      throw new Error("Cette sauvegarde Stomo n’est pas reconnue.");
    if (manifest.frames.length > MAX_FRAMES)
      throw new Error(`Ce projet contient plus de ${MAX_FRAMES} photos.`);

    const orientation =
      manifest.project.orientation ??
      (manifest.project.height > manifest.project.width
        ? "portrait"
        : "landscape");
    const importedName = `${manifest.project.name.trim().slice(0, 50)} (importé)`;
    const created = await createProject(importedName, orientation);
    createdId = created.id;
    await saveProject({
      ...created,
      ...manifest.project,
      id: created.id,
      name: importedName,
      createdAt: created.createdAt,
      updatedAt: Date.now(),
      frameCount: 0,
      orientation,
      cameraDeviceId: manifest.project.cameraDeviceId ?? null,
    });
    const frameOrder = manifest.frames
      .map((descriptor, index) => ({ index, position: descriptor.position }))
      .sort((a, b) => a.position - b.position);
    for (let index = 0; index < frameOrder.length; index += 1) {
      const sourceIndex = frameOrder[index].index;
      let imageFile: string;
      let thumbnailFile: string | null = null;
      if (manifest.version === 1) {
        imageFile = manifest.frames[sourceIndex].file;
      } else {
        imageFile = manifest.frames[sourceIndex].imageFile;
        thumbnailFile = manifest.frames[sourceIndex].thumbnailFile;
      }
      const imageEntry = entries.find(
        (candidate) => candidate.filename === imageFile,
      );
      if (!imageEntry || imageEntry.directory)
        throw new Error(`La photo ${index + 1} manque dans ce projet.`);
      const image = await imageEntry.getData(new BlobWriter("image/webp"));
      if (!image.size)
        throw new Error(`La photo ${index + 1} est vide dans ce projet.`);
      let thumbnail: Blob | null = null;
      if (thumbnailFile) {
        const thumbnailEntry = entries.find(
          (candidate) => candidate.filename === thumbnailFile,
        );
        if (thumbnailEntry && !thumbnailEntry.directory) {
          const storedThumbnail = await thumbnailEntry.getData(
            new BlobWriter("image/webp"),
          );
          if (storedThumbnail.size) thumbnail = storedThumbnail;
        }
      }
      thumbnail ??= await createThumbnail(image, orientation);
      await addFrame(
        created.id,
        image,
        thumbnail,
        manifest.project.width,
        manifest.project.height,
      );
      onProgress(index + 1, manifest.frames.length);
    }
    const project = await getProject(created.id);
    const frames = await listFrames(created.id);
    if (!project) throw new Error("Le projet importé n’a pas pu être relu.");
    return { project, frames, importId: createId("import") };
  } catch (error) {
    if (createdId) await deleteProject(createdId).catch(() => undefined);
    throw error;
  } finally {
    await reader.close();
  }
}
