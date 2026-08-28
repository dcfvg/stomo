export type FrameRate = 4 | 6 | 8 | 10 | 12;
export type CountdownSeconds = 0 | 1 | 2 | 3 | 5;
export type FilmOrientation = "landscape" | "portrait";
export type AutoPreviewLoops = 0 | 1 | 2 | 3 | 4;

export interface ProjectRecord {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  fps: FrameRate;
  countdownSeconds: CountdownSeconds;
  onionOpacity: number;
  autoPreviewFrames: number;
  autoPreviewLoops: AutoPreviewLoops;
  width: number;
  height: number;
  frameCount: number;
  gridEnabled: boolean;
  cameraFacing: "environment" | "user";
  cameraDeviceId: string | null;
  orientation: FilmOrientation;
}

export interface FrameRecord {
  id: string;
  projectId: string;
  position: number;
  image: Blob;
  thumbnail: Blob;
  thumbnailNeedsRepair?: boolean;
}

export interface ChildSessionRecord {
  active: boolean;
  sessionId: string | null;
  startedAt: number | null;
  lastHeartbeatAt: number | null;
  pendingHiddenAt: number | null;
  pinSalt: string;
  pinHash: string;
  unacknowledgedEvents: number;
}

export type SessionEventType =
  | "session-started"
  | "app-hidden"
  | "app-visible"
  | "focus-lost"
  | "fullscreen-exited"
  | "unexpected-restart"
  | "session-ended";

export interface SessionEvent {
  id: string;
  sessionId: string;
  type: SessionEventType;
  occurredAt: number;
  hiddenDurationMs?: number;
  acknowledgedAt?: number;
}

export interface StomoManifestV1 {
  format: "stomo-project";
  version: 1;
  project: Omit<
    ProjectRecord,
    | "id"
    | "createdAt"
    | "updatedAt"
    | "frameCount"
    | "orientation"
    | "cameraDeviceId"
  > & {
    orientation?: FilmOrientation;
    cameraDeviceId?: string | null;
  };
  frames: Array<{ file: string; position: number }>;
}

export interface StomoManifestV2 {
  format: "stomo-project";
  version: 2;
  project: Omit<ProjectRecord, "id" | "createdAt" | "updatedAt" | "frameCount">;
  frames: Array<{
    imageFile: string;
    thumbnailFile: string;
    position: number;
  }>;
}

export type StomoManifest = StomoManifestV1 | StomoManifestV2;

export interface ExportProgress {
  label: string;
  current: number;
  total: number;
}
