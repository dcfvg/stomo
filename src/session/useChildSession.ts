import { useCallback, useEffect, useRef, useState } from "react";
import { createId } from "../lib/ids";
import { createPinHash, verifyPin } from "../security/pin";
import {
  acknowledgeSessionEvents,
  addDurationToLatestExitEvent,
  addSessionEvent,
  clearSessionEvents,
  emptyChildSession,
  getChildSession,
  listSessionEvents,
  saveChildSession,
} from "../storage/database";
import type { ChildSessionRecord, SessionEvent } from "../types";

const MARKER_KEY = "stomo-child-session-marker";
const HEARTBEAT_INTERVAL = 5_000;
const FOCUS_LOSS_DELAY = 450;
const FULLSCREEN_BLUR_GRACE = 900;

function requestImmersiveFullscreen() {
  return document.documentElement
    .requestFullscreen?.({ navigationUI: "hide" })
    .catch(() => undefined);
}

interface SessionMarker {
  sessionId: string;
  heartbeatAt: number;
  hiddenAt: number | null;
}

function readMarker(): SessionMarker | null {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(MARKER_KEY) ?? "null",
    );
    if (!value || typeof value !== "object") return null;
    const marker = value as Partial<SessionMarker>;
    if (
      typeof marker.sessionId !== "string" ||
      typeof marker.heartbeatAt !== "number"
    )
      return null;
    return {
      sessionId: marker.sessionId,
      heartbeatAt: marker.heartbeatAt,
      hiddenAt: marker.hiddenAt ?? null,
    };
  } catch {
    return null;
  }
}

function writeMarker(session: ChildSessionRecord, hiddenAt: number | null) {
  if (!session.active || !session.sessionId) {
    localStorage.removeItem(MARKER_KEY);
    return;
  }
  localStorage.setItem(
    MARKER_KEY,
    JSON.stringify({
      sessionId: session.sessionId,
      heartbeatAt: Date.now(),
      hiddenAt,
    } satisfies SessionMarker),
  );
}

export function useChildSession() {
  const [session, setSession] =
    useState<ChildSessionRecord>(emptyChildSession());
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [ready, setReady] = useState(false);
  const [fullscreenActive, setFullscreenActive] = useState(
    Boolean(document.fullscreenElement),
  );
  const sessionRef = useRef(session);
  const eventQueue = useRef<Promise<void>>(Promise.resolve());
  const focusLossTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fullscreenWasActive = useRef(Boolean(document.fullscreenElement));
  const ignoreBlurUntil = useRef(0);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const refreshEvents = useCallback(
    async () => setEvents(await listSessionEvents()),
    [],
  );

  const enqueue = useCallback(
    (operation: () => Promise<void>) => {
      eventQueue.current = eventQueue.current
        .then(operation)
        .then(refreshEvents)
        .catch(() => {
          // Le marqueur localStorage reste la copie immédiate de secours.
        });
    },
    [refreshEvents],
  );

  useEffect(() => {
    let alive = true;
    void (async () => {
      let stored = await getChildSession();
      const marker = readMarker();
      if (
        stored.active &&
        stored.sessionId &&
        marker?.sessionId === stored.sessionId
      ) {
        const occurredAt = marker.hiddenAt ?? marker.heartbeatAt;
        await addSessionEvent({
          sessionId: stored.sessionId,
          type: "unexpected-restart",
          occurredAt,
          hiddenDurationMs: Date.now() - occurredAt,
        });
        stored = {
          ...stored,
          unacknowledgedEvents: stored.unacknowledgedEvents + 1,
          pendingHiddenAt: null,
        };
        await saveChildSession(stored);
      }
      writeMarker(stored, null);
      if (!alive) return;
      sessionRef.current = stored;
      setSession(stored);
      setEvents(await listSessionEvents());
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!ready || !session.active) return;
    const timer = setInterval(() => {
      writeMarker(sessionRef.current, sessionRef.current.pendingHiddenAt);
      const current = sessionRef.current;
      if (current.active) {
        const updated = { ...current, lastHeartbeatAt: Date.now() };
        sessionRef.current = updated;
        void saveChildSession(updated);
      }
    }, HEARTBEAT_INTERVAL);
    return () => clearInterval(timer);
  }, [ready, session.active]);

  useEffect(() => {
    if (!ready) return;
    const cancelFocusLoss = () => {
      if (focusLossTimer.current !== null) {
        clearTimeout(focusLossTimer.current);
        focusLossTimer.current = null;
      }
    };
    const becomeHidden = (type: "app-hidden" | "focus-lost") => {
      const current = sessionRef.current;
      if (!current.active || !current.sessionId || current.pendingHiddenAt)
        return;
      const sessionId = current.sessionId;
      const hiddenAt = Date.now();
      const updated = {
        ...current,
        pendingHiddenAt: hiddenAt,
        lastHeartbeatAt: hiddenAt,
        unacknowledgedEvents: current.unacknowledgedEvents + 1,
      };
      sessionRef.current = updated;
      setSession(updated);
      writeMarker(updated, hiddenAt);
      window.dispatchEvent(new Event("stomo-background"));
      enqueue(async () => {
        await saveChildSession(updated);
        await addSessionEvent({
          sessionId,
          type,
          occurredAt: hiddenAt,
        });
      });
    };
    const becomeVisible = () => {
      const current = sessionRef.current;
      if (!current.active || !current.sessionId || !current.pendingHiddenAt)
        return;
      const sessionId = current.sessionId;
      const visibleAt = Date.now();
      const hiddenAt = current.pendingHiddenAt;
      const updated = {
        ...current,
        pendingHiddenAt: null,
        lastHeartbeatAt: visibleAt,
      };
      sessionRef.current = updated;
      setSession(updated);
      writeMarker(updated, null);
      window.dispatchEvent(new Event("stomo-foreground"));
      enqueue(async () => {
        await saveChildSession(updated);
        await addDurationToLatestExitEvent(sessionId, visibleAt - hiddenAt);
        await addSessionEvent({
          sessionId,
          type: "app-visible",
          occurredAt: visibleAt,
          hiddenDurationMs: visibleAt - hiddenAt,
        });
      });
    };
    const recordFullscreenExit = () => {
      const current = sessionRef.current;
      if (!current.active || !current.sessionId) return;
      const sessionId = current.sessionId;
      const occurredAt = Date.now();
      const updated = {
        ...current,
        lastHeartbeatAt: occurredAt,
        unacknowledgedEvents: current.unacknowledgedEvents + 1,
      };
      sessionRef.current = updated;
      setSession(updated);
      writeMarker(updated, updated.pendingHiddenAt);
      enqueue(async () => {
        await saveChildSession(updated);
        await addSessionEvent({
          sessionId,
          type: "fullscreen-exited",
          occurredAt,
        });
      });
    };
    const onVisibility = () => {
      cancelFocusLoss();
      if (document.visibilityState === "hidden") becomeHidden("app-hidden");
      else becomeVisible();
    };
    const onPageHide = () => {
      cancelFocusLoss();
      becomeHidden("app-hidden");
    };
    const onFreeze = () => {
      cancelFocusLoss();
      becomeHidden("app-hidden");
    };
    const onPageShow = () => becomeVisible();
    const onBlur = () => {
      cancelFocusLoss();
      if (
        !sessionRef.current.active ||
        document.visibilityState === "hidden" ||
        Date.now() < ignoreBlurUntil.current
      )
        return;
      focusLossTimer.current = setTimeout(() => {
        focusLossTimer.current = null;
        if (document.visibilityState !== "hidden") becomeHidden("focus-lost");
      }, FOCUS_LOSS_DELAY);
    };
    const onFocus = () => {
      cancelFocusLoss();
      becomeVisible();
    };
    const onFullscreenChange = () => {
      const isActive = Boolean(document.fullscreenElement);
      const didExit = fullscreenWasActive.current && !isActive;
      fullscreenWasActive.current = isActive;
      setFullscreenActive(isActive);
      if (!didExit) return;
      cancelFocusLoss();
      ignoreBlurUntil.current = Date.now() + FULLSCREEN_BLUR_GRACE;
      recordFullscreenExit();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("freeze", onFreeze);
    document.addEventListener("resume", becomeVisible);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      cancelFocusLoss();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("freeze", onFreeze);
      document.removeEventListener("resume", becomeVisible);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [enqueue, ready]);

  const start = useCallback(
    async (pin: string) => {
      if (!/^\d{4,6}$/.test(pin))
        throw new Error("Choisis un code de 4 à 6 chiffres.");
      const fullscreen = requestImmersiveFullscreen();
      const protectedPin = await createPinHash(pin);
      const now = Date.now();
      const next: ChildSessionRecord = {
        active: true,
        sessionId: createId("session"),
        startedAt: now,
        lastHeartbeatAt: now,
        pendingHiddenAt: null,
        pinSalt: protectedPin.pinSalt,
        pinHash: protectedPin.pinHash,
        unacknowledgedEvents: 0,
      };
      await saveChildSession(next);
      await addSessionEvent({
        sessionId: next.sessionId!,
        type: "session-started",
        occurredAt: now,
        acknowledgedAt: now,
      });
      writeMarker(next, null);
      sessionRef.current = next;
      setSession(next);
      await refreshEvents();
      await fullscreen;
      setFullscreenActive(Boolean(document.fullscreenElement));
    },
    [refreshEvents],
  );

  const enterFullscreen = useCallback(async () => {
    await requestImmersiveFullscreen();
    setFullscreenActive(Boolean(document.fullscreenElement));
  }, []);

  const checkPin = useCallback(async (pin: string) => {
    const current = sessionRef.current;
    if (
      !current.pinHash ||
      !(await verifyPin(pin, current.pinSalt, current.pinHash))
    ) {
      throw new Error("Ce code n’est pas le bon.");
    }
  }, []);

  const acknowledge = useCallback(
    async (pin: string) => {
      await checkPin(pin);
      await acknowledgeSessionEvents();
      const updated = { ...sessionRef.current, unacknowledgedEvents: 0 };
      await saveChildSession(updated);
      sessionRef.current = updated;
      setSession(updated);
      await refreshEvents();
    },
    [checkPin, refreshEvents],
  );

  const end = useCallback(
    async (pin: string) => {
      await checkPin(pin);
      const current = sessionRef.current;
      const now = Date.now();
      if (current.sessionId) {
        await addSessionEvent({
          sessionId: current.sessionId,
          type: "session-ended",
          occurredAt: now,
          acknowledgedAt: now,
        });
      }
      const updated = {
        ...current,
        active: false,
        sessionId: null,
        pendingHiddenAt: null,
        lastHeartbeatAt: now,
      };
      await saveChildSession(updated);
      writeMarker(updated, null);
      sessionRef.current = updated;
      setSession(updated);
      await refreshEvents();
      await document.exitFullscreen?.().catch(() => undefined);
    },
    [checkPin, refreshEvents],
  );

  const clearLog = useCallback(
    async (pin: string) => {
      await checkPin(pin);
      await clearSessionEvents();
      const updated = { ...sessionRef.current, unacknowledgedEvents: 0 };
      await saveChildSession(updated);
      sessionRef.current = updated;
      setSession(updated);
      setEvents([]);
    },
    [checkPin],
  );

  const latestAlert = events.find(
    (event) =>
      !event.acknowledgedAt &&
      (event.type === "app-hidden" ||
        event.type === "focus-lost" ||
        event.type === "fullscreen-exited" ||
        event.type === "unexpected-restart"),
  );

  return {
    session,
    events,
    ready,
    fullscreenActive,
    latestAlert,
    start,
    enterFullscreen,
    acknowledge,
    end,
    clearLog,
  };
}
