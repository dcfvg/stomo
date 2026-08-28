import "@fontsource-variable/lexend";
import { RiSparklingFill } from "@remixicon/react";
import { useEffect } from "react";
import { Home } from "./components/Home";
import { SessionUi } from "./components/SessionUi";
import { Studio } from "./components/Studio";
import { useChildSession } from "./session/useChildSession";
import { useStomoStore } from "./state/useStomoStore";

export default function App() {
  const { project, loading, initialize } = useStomoStore();
  const childSession = useChildSession();

  useEffect(() => {
    void initialize();
  }, [initialize]);

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
      events={childSession.events}
      latestAlert={childSession.latestAlert}
      onStart={childSession.start}
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
      {project ? <Studio /> : <Home />}
      {project && <div className="studio-session-layer">{sessionUi}</div>}
    </>
  );
}
