import { BlobReader, TextWriter, ZipReader } from "@zip.js/zip.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FrameRecord, ProjectRecord } from "../types";

vi.mock("./images", () => ({
  imageBlobToJpeg: vi.fn(
    async () => new Blob(["jpeg"], { type: "image/jpeg" }),
  ),
  createThumbnail: vi.fn(
    async () => new Blob(["thumb"], { type: "image/webp" }),
  ),
}));

import {
  buildPhotosZip,
  buildProjectArchive,
  importProject,
  safeFileName,
} from "./downloads";
import { imageBlobToJpeg } from "./images";

const project: ProjectRecord = {
  id: "project-export",
  name: "L’Épopée / des Dinos !",
  createdAt: 1,
  updatedAt: 1,
  fps: 8,
  countdownSeconds: 3,
  onionOpacity: 0.4,
  autoPreviewFrames: 8,
  autoPreviewLoops: 2,
  width: 1280,
  height: 720,
  frameCount: 0,
  gridEnabled: false,
  cameraFacing: "environment",
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

  it.each([1, 220, 240])(
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
    30_000,
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
    ) as { version: number };
    expect(manifest.version).toBe(1);
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
