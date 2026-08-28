import { useCallback, useEffect, useRef, useState } from "react";
import { createId } from "../lib/ids";
import { createPinHash, verifyPin } from "../security/pin";
import {
  acknowledgeSessionEvents,
  addDurationToLatestHiddenEvent,
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
const STALE_HEARTBEAT = 18_000;

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
  const sessionRef = useRef(session);
  const transitionRunning = useRef(false);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const refreshEvents = useCallback(
    async () => setEvents(await listSessionEvents()),
    [],
  );

  useEffect(() => {
    let alive = true;
    void (async () => {
      let stored = await getChildSession();
      const marker = readMarker();
      if (
        stored.active &&
        stored.sessionId &&
        marker?.sessionId === stored.sessionId &&
        (marker.hiddenAt !== null ||
          Date.now() - marker.heartbeatAt > STALE_HEARTBEAT)
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
    const becomeHidden = () => {
      const current = sessionRef.current;
      if (
        !current.active ||
        !current.sessionId ||
        current.pendingHiddenAt ||
        transitionRunning.current
      )
        return;
      transitionRunning.current = true;
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
      void Promise.all([
        saveChildSession(updated),
        addSessionEvent({
          sessionId: current.sessionId,
          type: "app-hidden",
          occurredAt: hiddenAt,
        }),
      ]).finally(() => {
        transitionRunning.current = false;
        void refreshEvents();
      });
    };
    const becomeVisible = () => {
      const current = sessionRef.current;
      if (
        !current.active ||
        !current.sessionId ||
        !current.pendingHiddenAt ||
        transitionRunning.current
      )
        return;
      transitionRunning.current = true;
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
      void Promise.all([
        saveChildSession(updated),
        addDurationToLatestHiddenEvent(current.sessionId, visibleAt - hiddenAt),
        addSessionEvent({
          sessionId: current.sessionId,
          type: "app-visible",
          occurredAt: visibleAt,
          hiddenDurationMs: visibleAt - hiddenAt,
        }),
      ]).finally(() => {
        transitionRunning.current = false;
        void refreshEvents();
      });
    };
    const onVisibility = () =>
      document.visibilityState === "hidden" ? becomeHidden() : becomeVisible();
    const onPageShow = () => becomeVisible();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", becomeHidden);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("freeze", becomeHidden);
    document.addEventListener("resume", becomeVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", becomeHidden);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("freeze", becomeHidden);
      document.removeEventListener("resume", becomeVisible);
    };
  }, [ready, refreshEvents]);

  const start = useCallback(
    async (pin: string) => {
      if (!/^\d{4,6}$/.test(pin))
        throw new Error("Choisis un code de 4 à 6 chiffres.");
      const fullscreen = document.documentElement
        .requestFullscreen?.()
        .catch(() => undefined);
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
    },
    [refreshEvents],
  );

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
      (event.type === "app-hidden" || event.type === "unexpected-restart"),
  );

  return {
    session,
    events,
    ready,
    latestAlert,
    start,
    acknowledge,
    end,
    clearLog,
  };
}
