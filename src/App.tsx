import "@fontsource-variable/lexend";
import { RiSparklingFill } from "@remixicon/react";
import { useEffect } from "react";
import { Home } from "./components/Home";
import { InstallPrompt } from "./components/InstallPrompt";
import { SessionUi } from "./components/SessionUi";
import { Studio } from "./components/Studio";
import { useChildSession } from "./session/useChildSession";
import { useStomoStore } from "./state/useStomoStore";
import { cleanupStaleExportFiles } from "./media/exportSink";

export default function App() {
  const { project, loading, initialize } = useStomoStore();
  const childSession = useChildSession();

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    void cleanupStaleExportFiles();
  }, []);

  useEffect(() => {
    const persist = () => {
      if (navigator.storage?.persist)
        void navigator.storage.persist().catch(() => undefined);
    };
    persist();
    window.addEventListener("appinstalled", persist);
    return () => window.removeEventListener("appinstalled", persist);
  }, []);

  useEffect(() => {
    const updateAppHeight = () => {
      const height = window.visualViewport?.height ?? window.innerHeight;
      const top = window.visualViewport?.offsetTop ?? 0;
      document.documentElement.style.setProperty("--app-height", `${height}px`);
      document.documentElement.style.setProperty("--viewport-top", `${top}px`);
    };
    updateAppHeight();
    window.addEventListener("resize", updateAppHeight);
    window.addEventListener("orientationchange", updateAppHeight);
    window.visualViewport?.addEventListener("resize", updateAppHeight);
    return () => {
      window.removeEventListener("resize", updateAppHeight);
      window.removeEventListener("orientationchange", updateAppHeight);
      window.visualViewport?.removeEventListener("resize", updateAppHeight);
    };
  }, []);

  if (loading && !project) {
    return (
      <main className="splash">
        <RiSparklingFill aria-hidden="true" />
        <strong>Stomo se prépare…</strong>
      </main>
    );
  }

  const sessionUi = (
    <SessionUi
      session={childSession.session}
      fullscreenActive={childSession.fullscreenActive}
      events={childSession.events}
      latestAlert={childSession.latestAlert}
      onStart={childSession.start}
      onEnterFullscreen={childSession.enterFullscreen}
      onAcknowledge={childSession.acknowledge}
      onEnd={childSession.end}
      onClear={childSession.clearLog}
    />
  );

  return (
    <>
      {!project && (
        <header className="home-header">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              <RiSparklingFill size={28} />
            </span>
            <div>
              <strong>Stomo</strong>
              <span>Mon studio d’animation</span>
            </div>
          </div>
          {sessionUi}
        </header>
      )}
      {project ? (
        <Studio />
      ) : (
        <>
          <InstallPrompt />
          <Home
            sessionActive={childSession.session.active}
            sessionId={childSession.session.sessionId}
            sessionEvents={childSession.events}
          />
        </>
      )}
      {project && <div className="studio-session-layer">{sessionUi}</div>}
    </>
  );
}
