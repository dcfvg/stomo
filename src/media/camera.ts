export interface CameraRequestResult {
  stream: MediaStream;
  selectedDeviceUnavailable: boolean;
}

export function cameraSecurityMessage() {
  return window.isSecureContext === false
    ? "Sur le réseau local, Chrome demande une adresse HTTPS. Lance « npm run dev:https » ou relie le téléphone par USB avec adb reverse."
    : null;
}

export function preferredCameraConstraints(
  facing: "environment" | "user",
  deviceId: string | null,
): MediaStreamConstraints {
  return {
    audio: false,
    video: {
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      aspectRatio: { ideal: 16 / 9 },
      ...(deviceId
        ? { deviceId: { exact: deviceId } }
        : { facingMode: { ideal: facing } }),
    },
  };
}

export async function requestCameraStream(
  mediaDevices: MediaDevices,
  facing: "environment" | "user",
  deviceId: string | null,
): Promise<CameraRequestResult> {
  try {
    return {
      stream: await mediaDevices.getUserMedia(
        preferredCameraConstraints(facing, deviceId),
      ),
      selectedDeviceUnavailable: false,
    };
  } catch {
    try {
      return {
        stream: await mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        }),
        selectedDeviceUnavailable: Boolean(deviceId),
      };
    } catch {
      return {
        stream: await mediaDevices.getUserMedia({ audio: false, video: true }),
        selectedDeviceUnavailable: Boolean(deviceId),
      };
    }
  }
}
