import { describe, expect, it } from "vitest";
import { createPinHash, verifyPin } from "./pin";

describe("code adulte", () => {
  it("accepte le bon code et refuse un autre code", async () => {
    const protectedPin = await createPinHash("2580");
    expect(
      await verifyPin("2580", protectedPin.pinSalt, protectedPin.pinHash),
    ).toBe(true);
    expect(
      await verifyPin("2581", protectedPin.pinSalt, protectedPin.pinHash),
    ).toBe(false);
  });
});
