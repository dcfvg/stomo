import { afterEach, describe, expect, it } from "vitest";
import { createPinHash, verifyPin } from "./pin";

describe("code adulte", () => {
  afterEach(() => {
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: undefined,
    });
  });

  it("accepte le bon code et refuse un autre code", async () => {
    const protectedPin = await createPinHash("2580");
    expect(
      await verifyPin("2580", protectedPin.pinSalt, protectedPin.pinHash),
    ).toBe(true);
    expect(
      await verifyPin("2581", protectedPin.pinSalt, protectedPin.pinHash),
    ).toBe(false);
  });

  it("explique le contexte non sécurisé avant WebCrypto", async () => {
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: false,
    });

    await expect(createPinHash("2580")).rejects.toThrow(
      "HTTPS ou de localhost",
    );
  });
});
