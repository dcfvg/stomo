type StorageManagerWithDirectory = StorageManager & {
  getDirectory?: () => Promise<FileSystemDirectoryHandle>;
};

export interface ExportFileSink {
  writable: WritableStream;
  finish: () => Promise<File>;
  discard: () => Promise<void>;
}

const TEMP_DIRECTORY = "stomo-exports-temporaires";

export async function createExportFileSink(
  fileName: string,
): Promise<ExportFileSink | null> {
  const storage = navigator.storage as StorageManagerWithDirectory | undefined;
  if (!storage?.getDirectory) return null;
  const root = await storage.getDirectory();
  const directory = await root.getDirectoryHandle(TEMP_DIRECTORY, {
    create: true,
  });
  const temporaryName = `${Date.now()}-${crypto.randomUUID()}-${fileName}`;
  const handle = await directory.getFileHandle(temporaryName, { create: true });
  const writable = (await handle.createWritable()) as WritableStream;
  return {
    writable,
    finish: async () => handle.getFile(),
    discard: async () => {
      await directory.removeEntry(temporaryName).catch(() => undefined);
    },
  };
}

export async function cleanupStaleExportFiles() {
  const storage = navigator.storage as StorageManagerWithDirectory | undefined;
  if (!storage?.getDirectory) return;
  try {
    const root = await storage.getDirectory();
    const directory = await root.getDirectoryHandle(TEMP_DIRECTORY);
    const directoryWithValues = directory as FileSystemDirectoryHandle & {
      values: () => AsyncIterableIterator<FileSystemHandle>;
    };
    if (typeof directoryWithValues.values !== "function") return;
    for await (const entry of directoryWithValues.values()) {
      if (entry.kind !== "file") continue;
      const file = await (entry as FileSystemFileHandle).getFile();
      if (Date.now() - file.lastModified > 10 * 60_000)
        await directory.removeEntry(entry.name).catch(() => undefined);
    }
  } catch {
    // Le nettoyage est une optimisation et ne doit jamais bloquer Stomo.
  }
}
