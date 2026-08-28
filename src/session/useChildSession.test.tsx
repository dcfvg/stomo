import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  emptyChildSession,
  listSessionEvents,
  saveChildSession,
} from "../storage/database";
import { useChildSession } from "./useChildSession";

describe("journal de session enfant", () => {
  beforeEach(() => localStorage.clear());

  it("note une sortie puis sa durée au retour", async () => {
    const sessionId = `session-visible-${crypto.randomUUID()}`;
    await saveChildSession({
      ...emptyChildSession(),
      active: true,
      sessionId,
      startedAt: Date.now(),
      lastHeartbeatAt: Date.now(),
      pinSalt: "salt",
      pinHash: "hash",
    });
    const { result, unmount } = renderHook(() => useChildSession());
    await waitFor(() => expect(result.current.ready).toBe(true));

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await waitFor(async () =>
      expect(
        (await listSessionEvents()).some(
          (event) =>
            event.sessionId === sessionId && event.type === "app-hidden",
        ),
      ).toBe(true),
    );

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await waitFor(() =>
      expect(result.current.latestAlert?.hiddenDurationMs).toBeTypeOf("number"),
    );
    expect(result.current.session.unacknowledgedEvents).toBe(1);
    unmount();
  });

  it("repère une interruption inattendue au démarrage suivant", async () => {
    const sessionId = `session-restart-${crypto.randomUUID()}`;
    const interruptedAt = Date.now() - 30_000;
    await saveChildSession({
      ...emptyChildSession(),
      active: true,
      sessionId,
      startedAt: interruptedAt - 10_000,
      lastHeartbeatAt: interruptedAt,
      pinSalt: "salt",
      pinHash: "hash",
    });
    localStorage.setItem(
      "stomo-child-session-marker",
      JSON.stringify({
        sessionId,
        heartbeatAt: interruptedAt,
        hiddenAt: interruptedAt,
      }),
    );

    const { result, unmount } = renderHook(() => useChildSession());
    await waitFor(() =>
      expect(
        result.current.events.some(
          (event) =>
            event.sessionId === sessionId &&
            event.type === "unexpected-restart",
        ),
      ).toBe(true),
    );
    expect(result.current.session.unacknowledgedEvents).toBe(1);
    unmount();
  });
});
