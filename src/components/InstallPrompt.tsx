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
    Boolean((navigator as NavigatorWithStandalone).standalone)
  );
}

export function InstallPrompt() {
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isInstalled()) return;
    const onInstallAvailable = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setDismissed(false);
    };
    const onInstalled = () => {
      setInstallEvent(null);
      setDismissed(true);
    };
    window.addEventListener("beforeinstallprompt", onInstallAvailable);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onInstallAvailable);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!installEvent || dismissed) return null;

  const install = async () => {
    setBusy(true);
    try {
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
          Tu le retrouveras comme une application et tu pourras créer sans
          internet.
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
          {busy ? "Installation…" : "Installer Stomo"}
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
