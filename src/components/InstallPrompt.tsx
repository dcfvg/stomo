import { RiCloseLine, RiInstallLine } from "@remixicon/react";
import { useEffect, useState } from "react";

export interface BeforeInstallPromptEvent extends Event {
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt: () => Promise<void>;
}

interface NavigatorWithStandalone extends Navigator {
  standalone?: boolean;
}

function isInstalled() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    Boolean((navigator as NavigatorWithStandalone).standalone) ||
    localStorage.getItem("stomo-installed") === "1"
  );
}

export function InstallPrompt() {
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [installed, setInstalled] = useState(isInstalled);
  const [manualHelp, setManualHelp] = useState(false);

  useEffect(() => {
    const onInstallAvailable = (event: Event) => {
      if (isInstalled()) return;
      event.preventDefault();
      localStorage.removeItem("stomo-installed");
      setInstalled(false);
      setInstallEvent(event as BeforeInstallPromptEvent);
      setDismissed(false);
    };
    const onInstalled = () => {
      localStorage.setItem("stomo-installed", "1");
      setInstalled(true);
      setInstallEvent(null);
      setDismissed(true);
    };
    const displayMode = window.matchMedia?.("(display-mode: standalone)");
    const onDisplayMode = () => setInstalled(isInstalled());
    window.addEventListener("beforeinstallprompt", onInstallAvailable);
    window.addEventListener("appinstalled", onInstalled);
    displayMode?.addEventListener?.("change", onDisplayMode);
    return () => {
      window.removeEventListener("beforeinstallprompt", onInstallAvailable);
      window.removeEventListener("appinstalled", onInstalled);
      displayMode?.removeEventListener?.("change", onDisplayMode);
    };
  }, []);

  if (installed || dismissed) return null;

  const install = async () => {
    setBusy(true);
    try {
      if (!installEvent) {
        setManualHelp(true);
        return;
      }
      await installEvent.prompt();
      await installEvent.userChoice;
      setInstallEvent(null);
    } catch {
      setInstallEvent(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="install-prompt" aria-labelledby="install-prompt-title">
      <span className="install-prompt__icon" aria-hidden="true">
        <RiInstallLine />
      </span>
      <p>
        <strong id="install-prompt-title">
          Installe Stomo sur ce téléphone
        </strong>
        <span>
          {manualHelp
            ? "Dans Chrome, touche ⋮ puis « Ajouter à l’écran d’accueil »."
            : "Tu le retrouveras comme une vraie application, avec tes films."}
        </span>
      </p>
      <div className="install-prompt__actions">
        <button
          className="install-prompt__install"
          type="button"
          disabled={busy}
          onClick={() => void install()}
        >
          <RiInstallLine aria-hidden="true" />
          {busy
            ? "Installation…"
            : installEvent
              ? "Installer Stomo"
              : "Comment installer"}
        </button>
        <button
          className="install-prompt__later"
          type="button"
          aria-label="Proposer l’installation plus tard"
          onClick={() => setDismissed(true)}
        >
          <RiCloseLine aria-hidden="true" /> Plus tard
        </button>
      </div>
    </aside>
  );
}
