import type {
  AutoPreviewLoops,
  ChildSessionRecord,
  FilmOrientation,
  FrameRecord,
  ProjectRecord,
  SessionEvent,
} from "../types";
import { createId } from "../lib/ids";

const DATABASE_NAME = "stomo";
const DATABASE_VERSION = 1;
const PROJECTS = "projects";
const FRAMES = "frames";
const SETTINGS = "settings";
const EVENTS = "session-events";
const CHILD_SESSION_KEY = "child-session";

type StoredSetting<T> = { key: string; value: T };

let databasePromise: Promise<IDBDatabase> | null = null;

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("La sauvegarde locale a échoué."));
  });
}

function transactionFinished(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("La sauvegarde locale a échoué."));
    transaction.onabort = () =>
      reject(
        transaction.error ?? new Error("La sauvegarde locale a été annulée."),
      );
  });
}

export function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PROJECTS)) {
        const projects = database.createObjectStore(PROJECTS, {
          keyPath: "id",
        });
        projects.createIndex("updatedAt", "updatedAt");
      }
      if (!database.objectStoreNames.contains(FRAMES)) {
        const frames = database.createObjectStore(FRAMES, { keyPath: "id" });
        frames.createIndex("by-project-position", ["projectId", "position"], {
          unique: true,
        });
      }
      if (!database.objectStoreNames.contains(SETTINGS)) {
        database.createObjectStore(SETTINGS, { keyPath: "key" });
      }
      if (!database.objectStoreNames.contains(EVENTS)) {
        const events = database.createObjectStore(EVENTS, { keyPath: "id" });
        events.createIndex("occurredAt", "occurredAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        request.error ??
          new Error("Stomo ne peut pas ouvrir sa mémoire locale."),
      );
  });
  return databasePromise;
}

const AUTO_PREVIEW_LOOPS = new Set([0, 1, 2, 3, 4]);
const COUNTDOWNS = new Set([0, 1, 2, 3, 5]);

export function normalizeProjectRecord(project: ProjectRecord): ProjectRecord {
  const orientation: FilmOrientation =
    project.orientation === "portrait" || project.orientation === "landscape"
      ? project.orientation
      : project.height > project.width
        ? "portrait"
        : "landscape";
  return {
    ...project,
    countdownSeconds: COUNTDOWNS.has(project.countdownSeconds)
      ? project.countdownSeconds
      : 2,
    autoPreviewFrames: 6,
    autoPreviewLoops: AUTO_PREVIEW_LOOPS.has(project.autoPreviewLoops)
      ? (project.autoPreviewLoops as AutoPreviewLoops)
      : 2,
    width: orientation === "portrait" ? 1080 : 1920,
    height: orientation === "portrait" ? 1920 : 1080,
    gridEnabled: Boolean(project.gridEnabled),
    cameraFacing:
      project.cameraFacing === "environment" ? "environment" : "user",
    cameraDeviceId:
      typeof project.cameraDeviceId === "string"
        ? project.cameraDeviceId
        : null,
    orientation,
  };
}

export async function createProject(
  name: string,
  orientation: FilmOrientation = "landscape",
): Promise<ProjectRecord> {
  const now = Date.now();
  const project: ProjectRecord = {
    id: createId("project"),
    name: name.trim() || "Mon nouveau film",
    createdAt: now,
    updatedAt: now,
    fps: 8,
    countdownSeconds: 2,
    onionOpacity: 0.4,
    autoPreviewFrames: 6,
    autoPreviewLoops: 2,
    width: orientation === "portrait" ? 1080 : 1920,
    height: orientation === "portrait" ? 1920 : 1080,
    frameCount: 0,
    gridEnabled: false,
    cameraFacing: "user",
    cameraDeviceId: null,
    orientation,
  };
  const database = await openDatabase();
  const transaction = database.transaction(PROJECTS, "readwrite");
  transaction.objectStore(PROJECTS).add(project);
  await transactionFinished(transaction);
  return project;
}

export async function listProjects(): Promise<ProjectRecord[]> {
  const database = await openDatabase();
  const transaction = database.transaction(PROJECTS, "readonly");
  const projects = await requestResult(
    transaction.objectStore(PROJECTS).getAll() as IDBRequest<ProjectRecord[]>,
  );
  await transactionFinished(transaction);
  return projects
    .map(normalizeProjectRecord)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getProject(
  id: string,
): Promise<ProjectRecord | undefined> {
  const database = await openDatabase();
  const transaction = database.transaction(PROJECTS, "readonly");
  const project = await requestResult(
    transaction.objectStore(PROJECTS).get(id) as IDBRequest<
      ProjectRecord | undefined
    >,
  );
  await transactionFinished(transaction);
  return project ? normalizeProjectRecord(project) : undefined;
}

export async function saveProject(project: ProjectRecord) {
  const database = await openDatabase();
  const transaction = database.transaction(PROJECTS, "readwrite");
  transaction
    .objectStore(PROJECTS)
    .put({ ...normalizeProjectRecord(project), updatedAt: Date.now() });
  await transactionFinished(transaction);
}

export async function renameProject(id: string, name: string) {
  const project = await getProject(id);
  if (!project) return;
  await saveProject({ ...project, name: name.trim() || project.name });
}

async function getFramesInTransaction(
  transaction: IDBTransaction,
  projectId: string,
) {
  const index = transaction.objectStore(FRAMES).index("by-project-position");
  const range = IDBKeyRange.bound(
    [projectId, 0],
    [projectId, Number.MAX_SAFE_INTEGER],
  );
  return requestResult(index.getAll(range) as IDBRequest<FrameRecord[]>);
}

export async function listFrames(projectId: string): Promise<FrameRecord[]> {
  const database = await openDatabase();
  const transaction = database.transaction(FRAMES, "readonly");
  const frames = await getFramesInTransaction(transaction, projectId);
  await transactionFinished(transaction);
  return frames
    .sort((a, b) => a.position - b.position)
    .map(normalizeFrameRecord);
}

export async function getProjectPreviewFrame(
  projectId: string,
): Promise<FrameRecord | undefined> {
  const database = await openDatabase();
  const transaction = database.transaction(FRAMES, "readonly");
  const index = transaction.objectStore(FRAMES).index("by-project-position");
  const range = IDBKeyRange.bound(
    [projectId, 0],
    [projectId, Number.MAX_SAFE_INTEGER],
  );
  const cursor = await requestResult(index.openCursor(range, "prev"));
  await transactionFinished(transaction);
  return cursor ? normalizeFrameRecord(cursor.value as FrameRecord) : undefined;
}

export function normalizeFrameRecord(frame: FrameRecord): FrameRecord {
  const imageIsValid = frame.image instanceof Blob && frame.image.size > 0;
  if (!imageIsValid) return frame;
  const thumbnailIsValid =
    frame.thumbnail instanceof Blob && frame.thumbnail.size > 0;
  return {
    ...frame,
    thumbnail: thumbnailIsValid ? frame.thumbnail : frame.image,
    thumbnailNeedsRepair: !thumbnailIsValid,
  };
}

export async function updateFrameThumbnail(frameId: string, thumbnail: Blob) {
  const database = await openDatabase();
  const transaction = database.transaction(FRAMES, "readwrite");
  const store = transaction.objectStore(FRAMES);
  const frame = await requestResult(
    store.get(frameId) as IDBRequest<FrameRecord | undefined>,
  );
  if (frame) store.put({ ...frame, thumbnail });
  await transactionFinished(transaction);
}

export async function addFrame(
  projectId: string,
  image: Blob,
  thumbnail: Blob,
) {
  const database = await openDatabase();
  const transaction = database.transaction([PROJECTS, FRAMES], "readwrite");
  const projectStore = transaction.objectStore(PROJECTS);
  const frameStore = transaction.objectStore(FRAMES);
  const project = await requestResult(
    projectStore.get(projectId) as IDBRequest<ProjectRecord | undefined>,
  );
  if (!project) {
    transaction.abort();
    throw new Error("Ce film n’existe plus.");
  }
  if (project.frameCount >= 240) {
    transaction.abort();
    throw new Error("Ton film a atteint 240 photos.");
  }
  const frame: FrameRecord = {
    id: createId("frame"),
    projectId,
    position: project.frameCount,
    image,
    thumbnail,
  };
  frameStore.add(frame);
  projectStore.put({
    ...project,
    frameCount: project.frameCount + 1,
    updatedAt: Date.now(),
  });
  await transactionFinished(transaction);
  return frame;
}

async function rewriteFrames(projectId: string, frames: FrameRecord[]) {
  const database = await openDatabase();
  const transaction = database.transaction([PROJECTS, FRAMES], "readwrite");
  const frameStore = transaction.objectStore(FRAMES);
  const projectStore = transaction.objectStore(PROJECTS);
  const existing = await getFramesInTransaction(transaction, projectId);
  existing.forEach((frame) => frameStore.delete(frame.id));
  frames.forEach((frame, position) =>
    frameStore.add({ ...frame, projectId, position }),
  );
  const project = await requestResult(
    projectStore.get(projectId) as IDBRequest<ProjectRecord | undefined>,
  );
  if (project)
    projectStore.put({
      ...project,
      frameCount: frames.length,
      updatedAt: Date.now(),
    });
  await transactionFinished(transaction);
}

export async function deleteFrame(projectId: string, frameId: string) {
  const frames = await listFrames(projectId);
  await rewriteFrames(
    projectId,
    frames.filter((frame) => frame.id !== frameId),
  );
}

export async function duplicateFrame(projectId: string, frameId: string) {
  const frames = await listFrames(projectId);
  if (frames.length >= 240) throw new Error("Ton film a atteint 240 photos.");
  const index = frames.findIndex((frame) => frame.id === frameId);
  if (index < 0) return;
  const source = frames[index];
  const copy: FrameRecord = { ...source, id: createId("frame") };
  frames.splice(index + 1, 0, copy);
  await rewriteFrames(projectId, frames);
}

export async function moveFrame(
  projectId: string,
  frameId: string,
  direction: -1 | 1,
) {
  const frames = await listFrames(projectId);
  const index = frames.findIndex((frame) => frame.id === frameId);
  const destination = index + direction;
  if (index < 0 || destination < 0 || destination >= frames.length) return;
  [frames[index], frames[destination]] = [frames[destination], frames[index]];
  await rewriteFrames(projectId, frames);
}

export async function deleteProject(id: string) {
  const database = await openDatabase();
  const transaction = database.transaction([PROJECTS, FRAMES], "readwrite");
  transaction.objectStore(PROJECTS).delete(id);
  const frameStore = transaction.objectStore(FRAMES);
  const index = frameStore.index("by-project-position");
  const range = IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]);
  const cursorRequest = index.openCursor(range);
  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;
    if (!cursor) return;
    cursor.delete();
    cursor.continue();
  };
  await transactionFinished(transaction);
}

export function emptyChildSession(): ChildSessionRecord {
  return {
    active: false,
    sessionId: null,
    startedAt: null,
    lastHeartbeatAt: null,
    pendingHiddenAt: null,
    pinSalt: "",
    pinHash: "",
    unacknowledgedEvents: 0,
  };
}

export async function getChildSession() {
  const database = await openDatabase();
  const transaction = database.transaction(SETTINGS, "readonly");
  const stored = await requestResult(
    transaction.objectStore(SETTINGS).get(CHILD_SESSION_KEY) as IDBRequest<
      StoredSetting<ChildSessionRecord> | undefined
    >,
  );
  await transactionFinished(transaction);
  return stored?.value ?? emptyChildSession();
}

export async function saveChildSession(value: ChildSessionRecord) {
  const database = await openDatabase();
  const transaction = database.transaction(SETTINGS, "readwrite");
  transaction.objectStore(SETTINGS).put({ key: CHILD_SESSION_KEY, value });
  await transactionFinished(transaction);
}

export async function addSessionEvent(event: Omit<SessionEvent, "id">) {
  const database = await openDatabase();
  const transaction = database.transaction(EVENTS, "readwrite");
  const record: SessionEvent = { ...event, id: createId("event") };
  transaction.objectStore(EVENTS).add(record);
  await transactionFinished(transaction);
  return record;
}

export async function listSessionEvents() {
  const database = await openDatabase();
  const transaction = database.transaction(EVENTS, "readonly");
  const events = await requestResult(
    transaction.objectStore(EVENTS).getAll() as IDBRequest<SessionEvent[]>,
  );
  await transactionFinished(transaction);
  return events.sort((a, b) => b.occurredAt - a.occurredAt);
}

export async function acknowledgeSessionEvents() {
  const database = await openDatabase();
  const transaction = database.transaction(EVENTS, "readwrite");
  const store = transaction.objectStore(EVENTS);
  const events = await requestResult(
    store.getAll() as IDBRequest<SessionEvent[]>,
  );
  const now = Date.now();
  events
    .filter((event) => !event.acknowledgedAt)
    .forEach((event) => store.put({ ...event, acknowledgedAt: now }));
  await transactionFinished(transaction);
}

export async function addDurationToLatestExitEvent(
  sessionId: string,
  hiddenDurationMs: number,
) {
  const database = await openDatabase();
  const transaction = database.transaction(EVENTS, "readwrite");
  const store = transaction.objectStore(EVENTS);
  const events = await requestResult(
    store.getAll() as IDBRequest<SessionEvent[]>,
  );
  const event = events
    .filter(
      (candidate) =>
        candidate.sessionId === sessionId &&
        (candidate.type === "app-hidden" || candidate.type === "focus-lost") &&
        candidate.hiddenDurationMs === undefined,
    )
    .sort((a, b) => b.occurredAt - a.occurredAt)[0];
  if (event) store.put({ ...event, hiddenDurationMs });
  await transactionFinished(transaction);
}

export async function clearSessionEvents() {
  const database = await openDatabase();
  const transaction = database.transaction(EVENTS, "readwrite");
  transaction.objectStore(EVENTS).clear();
  await transactionFinished(transaction);
}
