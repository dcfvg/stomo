import {
  RiAlertFill,
  RiDeleteBinLine,
  RiFullscreenLine,
  RiHistoryLine,
  RiLockLine,
  RiShieldCheckLine,
  RiShieldStarLine,
} from "@remixicon/react";
import { useState } from "react";
import { canUseFullscreen, isStandaloneApp } from "../lib/capabilities";
import type { SessionEvent } from "../types";
import { Dialog } from "./Dialog";

type ProtectedAction = "acknowledge" | "end" | "clear";

interface SessionUiProps {
  session: { active: boolean; unacknowledgedEvents: number };
  fullscreenActive: boolean;
  events: SessionEvent[];
  latestAlert?: SessionEvent;
  onStart: (pin: string) => Promise<void>;
  onEnterFullscreen: () => Promise<void>;
  onAcknowledge: (pin: string) => Promise<void>;
  onEnd: (pin: string) => Promise<void>;
  onClear: (pin: string) => Promise<void>;
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(timestamp);
}

function formatDuration(duration = 0) {
  const seconds = Math.max(1, Math.round(duration / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ${seconds % 60} s`;
}

function eventLabel(event: SessionEvent) {
  switch (event.type) {
    case "session-started":
      return "Session enfant démarrée";
    case "app-hidden":
      return "Stomo n’était plus visible";
    case "app-visible":
      return `Retour dans Stomo après ${formatDuration(event.hiddenDurationMs)}`;
    case "focus-lost":
      return "Stomo a perdu le focus";
    case "fullscreen-exited":
      return "Sortie du plein écran";
    case "unexpected-restart":
      return "Interruption inattendue";
    case "session-ended":
      return "Session enfant terminée";
  }
}

function alertLabel(event: SessionEvent) {
  switch (event.type) {
    case "focus-lost":
      return "Stomo a perdu le focus.";
    case "fullscreen-exited":
      return "Stomo a quitté le plein écran.";
    case "unexpected-restart":
      return "Interruption inattendue.";
    default:
      return "Stomo n’était plus visible.";
  }
}

export function SessionUi({
  session,
  fullscreenActive,
  events,
  latestAlert,
  onStart,
  onEnterFullscreen,
  onAcknowledge,
  onEnd,
  onClear,
}: SessionUiProps) {
  const fullscreenAvailable = canUseFullscreen();
  const [showStart, setShowStart] = useState(false);
  const [showJournal, setShowJournal] = useState(false);
  const [protectedAction, setProtectedAction] =
    useState<ProtectedAction | null>(null);
  const [pin, setPin] = useState("");
  const [pinConfirmation, setPinConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setPin("");
    setPinConfirmation("");
    setError("");
    setBusy(false);
  };
  const closeAll = () => {
    setShowStart(false);
    setProtectedAction(null);
    reset();
  };

  const submitStart = async () => {
    if (pin !== pinConfirmation)
      return setError("Les deux codes sont différents.");
    setBusy(true);
    setError("");
    try {
      await onStart(pin);
      closeAll();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "La session n’a pas pu démarrer.",
      );
      setBusy(false);
    }
  };

  const submitProtected = async () => {
    if (!protectedAction) return;
    setBusy(true);
    setError("");
    try {
      if (protectedAction === "acknowledge") await onAcknowledge(pin);
      if (protectedAction === "end") await onEnd(pin);
      if (protectedAction === "clear") await onClear(pin);
      closeAll();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Cette action n’a pas pu être faite.",
      );
      setBusy(false);
    }
  };

  return (
    <>
      <div className="session-actions">
        {session.active ? (
          <>
            <button
              className="session-state"
              type="button"
              onClick={() => setShowJournal(true)}
            >
              <RiShieldCheckLine aria-hidden="true" /> Session enfant active
              {session.unacknowledgedEvents > 0 && (
                <span>{session.unacknowledgedEvents}</span>
              )}
            </button>
            {!fullscreenActive && fullscreenAvailable && (
              <button
                className="compact-action compact-action--fullscreen"
                type="button"
                onClick={() => void onEnterFullscreen()}
              >
                <RiFullscreenLine aria-hidden="true" />
                <span>Plein écran</span>
              </button>
            )}
            <button
              className="compact-action"
              type="button"
              onClick={() => setProtectedAction("end")}
            >
              <RiLockLine aria-hidden="true" /> Terminer
            </button>
          </>
        ) : (
          <>
            {!fullscreenActive && fullscreenAvailable && !isStandaloneApp() && (
              <button
                className="compact-action compact-action--fullscreen"
                type="button"
                onClick={() => void onEnterFullscreen()}
                aria-label="Passer en plein écran"
                title="Plein écran"
              >
                <RiFullscreenLine aria-hidden="true" />
                <span>Plein écran</span>
              </button>
            )}
            <button
              className="session-state"
              type="button"
              onClick={() => setShowStart(true)}
            >
              <RiShieldStarLine aria-hidden="true" /> Démarrer une session
              enfant
            </button>
          </>
        )}
      </div>

      {latestAlert && (
        <aside className="exit-alert" role="alert">
          <RiAlertFill aria-hidden="true" />
          <p>
            <strong>{alertLabel(latestAlert)}</strong>
            <span>
              À{" "}
              {new Intl.DateTimeFormat("fr-FR", {
                hour: "2-digit",
                minute: "2-digit",
              }).format(latestAlert.occurredAt)}
              {latestAlert.hiddenDurationMs
                ? ` pendant ${formatDuration(latestAlert.hiddenDurationMs)}`
                : ""}
              .
            </span>
          </p>
          <button
            type="button"
            onClick={() => setProtectedAction("acknowledge")}
          >
            Code adulte pour valider
          </button>
        </aside>
      )}

      {showStart && (
        <Dialog title="Préparer la session enfant" onClose={closeAll}>
          <div className="dialog__content">
            <div className="parent-tip">
              <RiShieldStarLine aria-hidden="true" />
              <p>
                <strong>Stomo garde une trace des sorties.</strong>
                <span>
                  Pour empêcher vraiment de changer d’application, active aussi
                  « Épingler l’écran » dans Android après avoir démarré.
                </span>
              </p>
            </div>
            <label>
              Choisis un code adulte de 4 à 6 chiffres
              <input
                inputMode="numeric"
                autoComplete="new-password"
                value={pin}
                onChange={(event) =>
                  setPin(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                type="password"
              />
            </label>
            <label>
              Retape le même code
              <input
                inputMode="numeric"
                autoComplete="new-password"
                value={pinConfirmation}
                onChange={(event) =>
                  setPinConfirmation(
                    event.target.value.replace(/\D/g, "").slice(0, 6),
                  )
                }
                type="password"
              />
            </label>
            {error && <p className="form-error">{error}</p>}
            <button
              className="primary-button"
              type="button"
              onClick={() => void submitStart()}
              disabled={busy}
            >
              Démarrer et passer en plein écran
            </button>
          </div>
        </Dialog>
      )}

      {protectedAction && (
        <Dialog title="Code adulte" onClose={closeAll}>
          <div className="dialog__content">
            <label>
              Entre le code Stomo
              <input
                autoFocus
                inputMode="numeric"
                autoComplete="current-password"
                value={pin}
                onChange={(event) =>
                  setPin(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                type="password"
              />
            </label>
            {error && <p className="form-error">{error}</p>}
            <button
              className="primary-button"
              type="button"
              onClick={() => void submitProtected()}
              disabled={busy}
            >
              Valider
            </button>
          </div>
        </Dialog>
      )}

      {showJournal && (
        <Dialog
          title="Journal de la session"
          onClose={() => setShowJournal(false)}
          wide
        >
          <div className="dialog__content">
            <div className="journal-heading">
              <RiHistoryLine aria-hidden="true" />
              <p>
                <strong>Les sorties restent notées ici.</strong>
                <span>
                  Valider une alerte enlève son bandeau, pas sa ligne dans le
                  journal.
                </span>
              </p>
            </div>
            <ol className="journal-list">
              {events.length ? (
                events.map((event) => (
                  <li
                    key={event.id}
                    className={
                      !event.acknowledgedAt ? "journal-list__unread" : ""
                    }
                  >
                    <span>{eventLabel(event)}</span>
                    <time>{formatDate(event.occurredAt)}</time>
                  </li>
                ))
              ) : (
                <li>Le journal est vide.</li>
              )}
            </ol>
            <button
              className="danger-button"
              type="button"
              onClick={() => {
                setShowJournal(false);
                setProtectedAction("clear");
              }}
            >
              <RiDeleteBinLine aria-hidden="true" /> Effacer le journal avec le
              code adulte
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
