import {
  BlobReader,
  BlobWriter,
  TextReader,
  TextWriter,
  ZipReader,
  ZipWriter,
} from "@zip.js/zip.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FrameRecord, ProjectRecord } from "../types";

vi.mock("./images", () => ({
  imageBlobToJpeg: vi.fn(
    async () => new Blob(["jpeg"], { type: "image/jpeg" }),
  ),
  createThumbnail: vi.fn(
    async () => new Blob(["thumb"], { type: "image/webp" }),
  ),
  normalizeImageToWebp: vi.fn(async (blob: Blob) => blob),
}));

import {
  buildPhotosZip,
  buildProjectArchive,
  importProject,
  safeFileName,
} from "./downloads";
import { createThumbnail, imageBlobToJpeg } from "./images";

const project: ProjectRecord = {
  id: "project-export",
  name: "L’Épopée / des Dinos !",
  createdAt: 1,
  updatedAt: 1,
  fps: 8,
  countdownSeconds: 3,
  onionOpacity: 0.4,
  onionFrameCount: 2,
  autoPreviewFrames: 8,
  autoPreviewLoops: 2,
  width: 1920,
  height: 1080,
  frameCount: 0,
  gridEnabled: false,
  cameraFacing: "environment",
  cameraDeviceId: null,
  orientation: "landscape",
};

function frames(count: number): FrameRecord[] {
  return Array.from({ length: count }, (_, position) => ({
    id: `frame-${position}`,
    projectId: project.id,
    position,
    image: new Blob([`webp-${position}`], { type: "image/webp" }),
    thumbnail: new Blob(["thumb"], { type: "image/webp" }),
  }));
}

async function entries(blob: Blob) {
  const reader = new ZipReader(new BlobReader(blob));
  const result = await reader.getEntries();
  await reader.close();
  return result;
}

describe("téléchargements", () => {
  beforeEach(() => vi.clearAllMocks());

  it("nettoie les noms pour Android", () => {
    expect(safeFileName(project.name)).toBe("l-epopee-des-dinos");
  });

  it.each([1, 240, 480])(
    "crée un ZIP ordonné avec %i photos",
    async (count) => {
      const archive = await buildPhotosZip(
        { ...project, frameCount: count },
        frames(count),
        () => undefined,
      );
      const names = (await entries(archive)).map((entry) => entry.filename);
      expect(names).toHaveLength(count + 1);
      expect(names[0]).toBe("l-epopee-des-dinos_photos/0001.jpg");
      expect(names[count - 1]).toBe(
        `l-epopee-des-dinos_photos/${String(count).padStart(4, "0")}.jpg`,
      );
      expect(names[count]).toBe("l-epopee-des-dinos_photos/informations.txt");
    },
    60_000,
  );

  it("sauvegarde puis réimporte un projet sans écraser son identité locale", async () => {
    const originalFrames = frames(3);
    const archive = await buildProjectArchive(
      { ...project, frameCount: 3 },
      originalFrames,
      () => undefined,
    );
    const file = new File([archive], "dinos.stomo", {
      type: "application/x-stomo",
    });
    const imported = await importProject(file, () => undefined);

    expect(imported.project.id).not.toBe(project.id);
    expect(imported.project.name).toBe(`${project.name} (importé)`);
    expect(imported.frames).toHaveLength(3);
    const archiveEntries = await entries(archive);
    const manifestEntry = archiveEntries.find(
      (entry) => entry.filename === "projet.json",
    );
    if (!manifestEntry || manifestEntry.directory)
      throw new Error("Manifest absent");
    const manifest = JSON.parse(
      await manifestEntry.getData(new TextWriter()),
    ) as { version: number; project: { onionFrameCount?: number } };
    expect(manifest.version).toBe(2);
    expect(manifest.project.onionFrameCount).toBe(2);
    expect(
      archiveEntries.filter((entry) => entry.filename.startsWith("images/")),
    ).toHaveLength(3);
    expect(
      archiveEntries.filter((entry) => entry.filename.startsWith("vignettes/")),
    ).toHaveLength(3);
  });

  it.each([1, 240, 480])(
    "place %i originaux et vignettes non vides dans .stomo v2",
    async (count) => {
      const archive = await buildProjectArchive(
        { ...project, frameCount: count },
        frames(count),
        () => undefined,
      );
      const archiveEntries = await entries(archive);
      const mediaEntries = archiveEntries.filter(
        (entry) =>
          entry.filename.startsWith("images/") ||
          entry.filename.startsWith("vignettes/"),
      );
      expect(mediaEntries).toHaveLength(count * 2);
      for (const entry of mediaEntries) {
        if (entry.directory) throw new Error("Média transformé en dossier");
        expect((await entry.getData(new BlobWriter())).size).toBeGreaterThan(0);
      }
    },
    60_000,
  );

  it("importe une sauvegarde v1 et régénère sa vignette", async () => {
    const writer = new ZipWriter(new BlobWriter("application/x-stomo"));
    const legacyManifest = {
      format: "stomo-project",
      version: 1,
      project: {
        name: "Ancien film",
        fps: 8,
        countdownSeconds: 3,
        onionOpacity: 0.4,
        autoPreviewFrames: 8,
        autoPreviewLoops: 2,
        width: 1280,
        height: 720,
        gridEnabled: false,
        cameraFacing: "environment",
      },
      frames: [{ file: "images/0001.webp", position: 0 }],
    };
    await writer.add(
      "projet.json",
      new TextReader(JSON.stringify(legacyManifest)),
    );
    await writer.add(
      "images/0001.webp",
      new BlobReader(new Blob(["legacy-image"], { type: "image/webp" })),
    );
    const archive = await writer.close();

    const imported = await importProject(
      new File([archive], "ancien.stomo"),
      () => undefined,
    );

    expect(imported.project).toMatchObject({
      name: "Ancien film (importé)",
      orientation: "landscape",
      width: 1920,
      height: 1080,
      onionFrameCount: 2,
    });
    expect(imported.frames).toHaveLength(1);
    expect(createThumbnail).toHaveBeenCalled();
  });

  it("laisse les photos intactes si un ZIP est interrompu", async () => {
    const source = frames(3);
    vi.mocked(imageBlobToJpeg).mockRejectedValueOnce(
      new Error("Plus de place"),
    );
    await expect(
      buildPhotosZip({ ...project, frameCount: 3 }, source, () => undefined),
    ).rejects.toThrow("Plus de place");
    expect(source.map((frame) => frame.id)).toEqual([
      "frame-0",
      "frame-1",
      "frame-2",
    ]);
    expect(source.every((frame) => frame.image.size > 0)).toBe(true);
  });
});
