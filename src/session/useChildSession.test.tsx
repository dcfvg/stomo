import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  emptyChildSession,
  listSessionEvents,
  saveChildSession,
} from "../storage/database";
import { useChildSession } from "./useChildSession";

describe("journal de session enfant", () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: null,
    });
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      configurable: true,
      value: undefined,
    });
  });

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

  it("repère aussi une relance immédiate sans événement hidden", async () => {
    const sessionId = `session-fast-restart-${crypto.randomUUID()}`;
    const interruptedAt = Date.now() - 100;
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
        hiddenAt: null,
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

  it("ne perd pas un retour immédiat après le bouton Home", async () => {
    const sessionId = `session-rapid-${crypto.randomUUID()}`;
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

    act(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "visible",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await waitFor(async () => {
      const events = await listSessionEvents();
      const hidden = events.find(
        (event) => event.sessionId === sessionId && event.type === "app-hidden",
      );
      expect(hidden?.hiddenDurationMs).toBeTypeOf("number");
      expect(
        events.some(
          (event) =>
            event.sessionId === sessionId && event.type === "app-visible",
        ),
      ).toBe(true);
    });
    unmount();
  });

  it("note une perte de focus même lorsque la page reste visible", async () => {
    const sessionId = `session-focus-${crypto.randomUUID()}`;
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

    act(() => window.dispatchEvent(new Event("blur")));
    await waitFor(
      async () =>
        expect(
          (await listSessionEvents()).some(
            (event) =>
              event.sessionId === sessionId && event.type === "focus-lost",
          ),
        ).toBe(true),
      { timeout: 1_500 },
    );

    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(async () => {
      const focusLoss = (await listSessionEvents()).find(
        (event) => event.sessionId === sessionId && event.type === "focus-lost",
      );
      expect(focusLoss?.hiddenDurationMs).toBeTypeOf("number");
    });
    expect(result.current.session.unacknowledgedEvents).toBe(1);
    unmount();
  });

  it("préfère la sortie masquée quand blur et hidden se suivent", async () => {
    const sessionId = `session-blur-hidden-${crypto.randomUUID()}`;
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

    act(() => {
      window.dispatchEvent(new Event("blur"));
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(async () =>
      expect(
        (await listSessionEvents()).some(
          (event) =>
            event.sessionId === sessionId && event.type === "app-hidden",
        ),
      ).toBe(true),
    );
    await new Promise((resolve) => setTimeout(resolve, 550));
    const exitEvents = (await listSessionEvents()).filter(
      (event) =>
        event.sessionId === sessionId &&
        (event.type === "app-hidden" || event.type === "focus-lost"),
    );
    expect(exitEvents.map((event) => event.type)).toEqual(["app-hidden"]);
    unmount();
  });

  it("note une sortie du plein écran", async () => {
    const sessionId = `session-fullscreen-${crypto.randomUUID()}`;
    const fullscreenRoot = document.createElement("div");
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: fullscreenRoot,
    });
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

    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: null,
    });
    act(() => document.dispatchEvent(new Event("fullscreenchange")));

    await waitFor(async () =>
      expect(
        (await listSessionEvents()).some(
          (event) =>
            event.sessionId === sessionId && event.type === "fullscreen-exited",
        ),
      ).toBe(true),
    );
    expect(result.current.session.unacknowledgedEvents).toBe(1);
    unmount();
  });

  it("remet le plein écran sans demander le code adulte", async () => {
    const sessionId = `session-refullscreen-${crypto.randomUUID()}`;
    const fullscreenRoot = document.documentElement;
    const requestFullscreen = vi.fn(async () => {
      Object.defineProperty(document, "fullscreenElement", {
        configurable: true,
        value: fullscreenRoot,
      });
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      configurable: true,
      value: requestFullscreen,
    });
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

    await act(() => result.current.enterFullscreen());

    expect(requestFullscreen).toHaveBeenCalledOnce();
    expect(requestFullscreen).toHaveBeenCalledWith({ navigationUI: "hide" });
    expect(result.current.fullscreenActive).toBe(true);
    expect(
      (await listSessionEvents()).some(
        (event) =>
          event.sessionId === sessionId && event.type === "fullscreen-exited",
      ),
    ).toBe(false);
    unmount();
  });
});
