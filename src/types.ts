export type FrameRate = 4 | 6 | 8 | 10 | 12;
export type CountdownSeconds = 0 | 1 | 3 | 5;

export interface ProjectRecord {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  fps: FrameRate;
  countdownSeconds: CountdownSeconds;
  onionOpacity: number;
  autoPreviewFrames: 8;
  autoPreviewLoops: 2;
  width: number;
  height: number;
  frameCount: number;
  gridEnabled: boolean;
  cameraFacing: "environment" | "user";
}

export interface FrameRecord {
  id: string;
  projectId: string;
  position: number;
  image: Blob;
  thumbnail: Blob;
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
  project: Omit<ProjectRecord, "id" | "createdAt" | "updatedAt" | "frameCount">;
  frames: Array<{ file: string; position: number }>;
}

export interface ExportProgress {
  label: string;
  current: number;
  total: number;
}
