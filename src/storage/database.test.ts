import { describe, expect, it } from "vitest";
import type { ProjectRecord } from "../types";
import {
  addFrame,
  createProject,
  deleteFrame,
  duplicateFrame,
  getFrameImage,
  getProjectPreviewFrame,
  getProject,
  getShootingPreferences,
  listFrames,
  moveFrame,
  normalizeFrameRecord,
  normalizeProjectRecord,
  normalizeShootingPreferences,
  renameProject,
  saveProject,
  saveShootingPreferences,
} from "./database";

const image = () => new Blob(["image"], { type: "image/webp" });

describe("montage stocké dans le navigateur", () => {
  it("ajoute, duplique, déplace et supprime sans perdre l’ordre", async () => {
    const project = await createProject(`Test montage ${crypto.randomUUID()}`);
    const first = await addFrame(project.id, image(), image());
    const second = await addFrame(project.id, image(), image());

    await duplicateFrame(project.id, first.id);
    let frames = await listFrames(project.id);
    expect("image" in frames[0]).toBe(false);
    expect(await getFrameImage(first.id)).toBeDefined();
    expect(frames).toHaveLength(3);
    expect(frames.map((frame) => frame.position)).toEqual([0, 1, 2]);
    expect(frames[1].id).not.toBe(first.id);

    await moveFrame(project.id, second.id, -1);
    frames = await listFrames(project.id);
    expect(frames[1].id).toBe(second.id);

    await deleteFrame(project.id, second.id);
    frames = await listFrames(project.id);
    expect(frames).toHaveLength(2);
    expect(frames.map((frame) => frame.position)).toEqual([0, 1]);
  });

  it("bloque la 481e photo", async () => {
    const project = await createProject(`Test limite ${crypto.randomUUID()}`);
    for (let index = 0; index < 480; index += 1)
      await addFrame(project.id, image(), image());
    await expect(addFrame(project.id, image(), image())).rejects.toThrow(
      "480 photos",
    );
    expect(await listFrames(project.id)).toHaveLength(480);
  });

  it("crée les nouveaux films en Full HD", async () => {
    const landscape = await createProject(`Paysage ${crypto.randomUUID()}`);
    const portrait = await createProject(
      `Vertical ${crypto.randomUUID()}`,
      "portrait",
    );
    expect(await getProject(landscape.id)).toMatchObject({
      orientation: "landscape",
      width: 1920,
      height: 1080,
    });
    expect(await getProject(portrait.id)).toMatchObject({
      orientation: "portrait",
      width: 1080,
      height: 1920,
    });
  });

  it("préserve la date à la lecture et la change lors d’un renommage", async () => {
    const project = await createProject(`Titre ${crypto.randomUUID()}`);
    await saveProject({ ...project, updatedAt: 123 });
    expect((await getProject(project.id))?.updatedAt).toBe(123);

    await renameProject(project.id, "Nouveau titre");
    expect(await getProject(project.id)).toMatchObject({
      name: "Nouveau titre",
    });
    expect((await getProject(project.id))!.updatedAt).toBeGreaterThan(123);

    await renameProject(project.id, " ");
    expect((await getProject(project.id))?.name).toBe("Nouveau titre");

    await renameProject(project.id, "x".repeat(80));
    expect((await getProject(project.id))?.name).toHaveLength(60);
  });

  it("retire les anciennes habitudes du projet normalisé", () => {
    const project = normalizeProjectRecord({
      id: "ancien",
      name: "Ancien",
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
      cameraDeviceId: null,
      orientation: "landscape",
    } as unknown as ProjectRecord);
    expect(project).toMatchObject({ width: 1920, height: 1080 });
    expect(project).not.toHaveProperty("onionFrameCount");
    expect(project).not.toHaveProperty("countdownSeconds");
  });

  it.each([
    [0, 0],
    [1, 1],
    [2, 1],
    [3, 1],
    [4, 1],
  ])("migre %i passage(s) vers l’aperçu activé ou coupé", (loops, expected) => {
    const preferences = normalizeShootingPreferences({
      countdownSeconds: 2,
      onionOpacity: 0.4,
      onionFrameCount: 2,
      autoPreviewLoops: loops,
      gridEnabled: false,
      cameraFacing: "environment",
      cameraDeviceId: null,
    });

    expect(preferences.autoPreviewEnabled).toBe(Boolean(expected));
  });

  it("partage et conserve les habitudes de prise de vue", async () => {
    const firstProject = await createProject(
      `Habitudes ${crypto.randomUUID()}`,
    );
    await saveProject({ ...firstProject, updatedAt: 321 });
    await saveShootingPreferences({
      countdownSeconds: 5,
      onionOpacity: 0.6,
      onionFrameCount: 3,
      autoPreviewEnabled: false,
      gridEnabled: true,
      cameraFacing: "user",
      cameraDeviceId: "camera-enfant",
    });
    await createProject(`Autre film ${crypto.randomUUID()}`);
    expect(await getShootingPreferences()).toEqual({
      countdownSeconds: 5,
      onionOpacity: 0.6,
      onionFrameCount: 3,
      autoPreviewEnabled: false,
      gridEnabled: true,
      cameraFacing: "user",
      cameraDeviceId: "camera-enfant",
    });
    expect((await getProject(firstProject.id))?.updatedAt).toBe(321);
  });

  it("utilise l’original immédiatement quand une vignette manque", async () => {
    const original = image();
    const frame = normalizeFrameRecord({
      id: "frame-vignette",
      projectId: "project-vignette",
      position: 0,
      image: original,
      thumbnail: new Blob([]),
    });
    expect(frame.thumbnail).toBe(original);
    expect(frame.thumbnailNeedsRepair).toBe(true);
  });

  it("utilise la dernière photo comme aperçu du film", async () => {
    const project = await createProject(`Aperçu ${crypto.randomUUID()}`);
    await addFrame(
      project.id,
      new Blob(["original-1"], { type: "image/webp" }),
      new Blob(["vignette-1"], { type: "image/webp" }),
    );
    const second = await addFrame(
      project.id,
      new Blob(["original-2"], { type: "image/webp" }),
      new Blob(["vignette-numero-2"], { type: "image/webp" }),
    );

    const preview = await getProjectPreviewFrame(project.id);
    expect(preview?.position).toBe(1);
    expect(preview?.id).toBe(second.id);
  });
});
