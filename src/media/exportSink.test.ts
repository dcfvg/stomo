import { afterEach, describe, expect, it, vi } from "vitest";
import { createExportFileSink } from "./exportSink";

describe("fichier temporaire d’export", () => {
  afterEach(() => vi.restoreAllMocks());

  it("écrit sur le stockage privé puis permet de récupérer un File", async () => {
    const removeEntry = vi.fn().mockResolvedValue(undefined);
    const file = new File(["video"], "film.webm", { type: "video/webm" });
    const writable = new WritableStream();
    const getFileHandle = vi.fn().mockResolvedValue({
      createWritable: vi.fn().mockResolvedValue(writable),
      getFile: vi.fn().mockResolvedValue(file),
    });
    const getDirectoryHandle = vi.fn().mockResolvedValue({
      getFileHandle,
      removeEntry,
    });
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: {
        getDirectory: vi.fn().mockResolvedValue({ getDirectoryHandle }),
      },
    });

    const sink = await createExportFileSink("film.webm");
    expect(sink).not.toBeNull();
    expect(await sink!.finish()).toBe(file);
    await sink!.discard();
    expect(removeEntry).toHaveBeenCalledOnce();
  });
});
