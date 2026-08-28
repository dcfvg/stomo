import { describe, expect, it } from "vitest";
import {
  addFrame,
  createProject,
  deleteFrame,
  duplicateFrame,
  listFrames,
  moveFrame,
} from "./database";

const image = () => new Blob(["image"], { type: "image/webp" });

describe("montage stocké dans le navigateur", () => {
  it("ajoute, duplique, déplace et supprime sans perdre l’ordre", async () => {
    const project = await createProject(`Test montage ${crypto.randomUUID()}`);
    const first = await addFrame(project.id, image(), image());
    const second = await addFrame(project.id, image(), image());

    await duplicateFrame(project.id, first.id);
    let frames = await listFrames(project.id);
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

  it("bloque la 241e photo", async () => {
    const project = await createProject(`Test limite ${crypto.randomUUID()}`);
    for (let index = 0; index < 240; index += 1)
      await addFrame(project.id, image(), image());
    await expect(addFrame(project.id, image(), image())).rejects.toThrow(
      "240 photos",
    );
    expect(await listFrames(project.id)).toHaveLength(240);
  });
});
