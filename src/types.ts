export type FrameRate = 4 | 6 | 8 | 10 | 12;
export type CountdownSeconds = 0 | 1 | 2 | 3 | 5;
export type FilmOrientation = "landscape" | "portrait";
export type AutoPreviewLoops = 0 | 1 | 2 | 3 | 4;
export type OnionFrameCount = 1 | 2 | 3;

export interface ShootingPreferences {
  countdownSeconds: CountdownSeconds;
  onionOpacity: number;
  onionFrameCount: OnionFrameCount;
  autoPreviewEnabled: boolean;
  gridEnabled: boolean;
  cameraFacing: "environment" | "user";
  cameraDeviceId: string | null;
}

export interface ProjectRecord {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  fps: FrameRate;
  width: number;
  height: number;
  frameCount: number;
  orientation: FilmOrientation;
}

export interface FrameSummary {
  id: string;
  projectId: string;
  position: number;
  thumbnail: Blob;
  width?: number | null;
  height?: number | null;
  thumbnailNeedsRepair?: boolean;
}

export interface FrameMediaRecord {
  frameId: string;
  image: Blob;
}

export interface FrameRecord extends FrameSummary {
  image: Blob;
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

interface ArchivedProjectSettings {
  name: string;
  fps: FrameRate;
  width: number;
  height: number;
  orientation?: FilmOrientation;
  countdownSeconds?: CountdownSeconds;
  onionOpacity?: number;
  onionFrameCount?: OnionFrameCount;
  autoPreviewFrames?: number;
  autoPreviewLoops?: AutoPreviewLoops;
  gridEnabled?: boolean;
  cameraFacing?: "environment" | "user";
  cameraDeviceId?: string | null;
}

export interface StomoManifestV1 {
  format: "stomo-project";
  version: 1;
  project: ArchivedProjectSettings;
  frames: Array<{ file: string; position: number }>;
}

export interface StomoManifestV2 {
  format: "stomo-project";
  version: 2;
  project: ArchivedProjectSettings;
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
