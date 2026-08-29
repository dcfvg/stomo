import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cameraSecurityMessage,
  preferredCameraConstraints,
  requestCameraStream,
} from "./camera";

describe("choix de la caméra", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: undefined,
    });
  });

  it("explique simplement quand l’adresse ne permet pas la caméra", () => {
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: false,
    });
    expect(cameraSecurityMessage()).toContain("version sécurisée");
  });

  it("demande la caméra arrière en Full HD par défaut", () => {
    expect(preferredCameraConstraints("environment", null)).toEqual({
      audio: false,
      video: {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        aspectRatio: { ideal: 16 / 9 },
        facingMode: { ideal: "environment" },
      },
    });
  });

  it("se replie automatiquement si la caméra choisie a disparu", async () => {
    const stream = {} as MediaStream;
    const getUserMedia = vi
      .fn<MediaDevices["getUserMedia"]>()
      .mockRejectedValueOnce(new Error("caméra absente"))
      .mockResolvedValueOnce(stream);
    const result = await requestCameraStream(
      { getUserMedia } as unknown as MediaDevices,
      "user",
      "ancienne-camera",
    );

    expect(result).toEqual({ stream, selectedDeviceUnavailable: true });
    expect(getUserMedia).toHaveBeenNthCalledWith(1, {
      audio: false,
      video: expect.objectContaining({
        deviceId: { exact: "ancienne-camera" },
      }),
    });
    expect(getUserMedia).toHaveBeenNthCalledWith(2, {
      audio: false,
      video: expect.objectContaining({ facingMode: { ideal: "user" } }),
    });
  });
});
