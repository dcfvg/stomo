import { RiCloseLine } from "@remixicon/react";
import { useEffect, useState, type ReactNode } from "react";

interface DialogProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}

function shouldCompactForKeyboard(target: Element | null) {
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  const editing =
    target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
  return editing || viewportHeight < window.innerHeight * 0.72;
}

export function Dialog({ title, children, onClose, wide }: DialogProps) {
  const [keyboardCompact, setKeyboardCompact] = useState(false);

  useEffect(() => {
    const update = () =>
      setKeyboardCompact(shouldCompactForKeyboard(document.activeElement));
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
        onFocusCapture={(event) =>
          setKeyboardCompact(shouldCompactForKeyboard(event.target))
        }
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
