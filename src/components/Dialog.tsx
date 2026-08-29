import { RiCloseLine } from "@remixicon/react";
import { useEffect, useState, type ReactNode } from "react";

interface DialogProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}

export function Dialog({ title, children, onClose, wide }: DialogProps) {
  const [keyboardCompact, setKeyboardCompact] = useState(false);

  useEffect(() => {
    const update = () => {
      const viewportHeight =
        window.visualViewport?.height ?? window.innerHeight;
      const active = document.activeElement;
      const editing =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement;
      setKeyboardCompact(editing || viewportHeight < window.innerHeight * 0.72);
    };
    window.visualViewport?.addEventListener("resize", update);
    return () => window.visualViewport?.removeEventListener("resize", update);
  }, []);

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className={`dialog ${wide ? "dialog--wide" : ""}${
          keyboardCompact ? " dialog--keyboard" : ""
        }`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onFocusCapture={() => setKeyboardCompact(true)}
      >
        <header className="dialog__header">
          <h2>{title}</h2>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="Fermer"
          >
            <RiCloseLine aria-hidden="true" />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
