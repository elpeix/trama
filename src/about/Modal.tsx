import { useEffect, useEffectEvent, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  title: ReactNode;
  label: string;
  className?: string;
  onClose: () => void;
  children: ReactNode;
  /** Buttons of its own instead of Close, which leave a click around the card alone. */
  actions?: ReactNode;
}

/**
 * A card over the page, named `label`, that closes with its button, with Escape or with a click
 * around it; with actions of its own, with those or with Escape.
 */
export function Modal({ title, label, className, onClose, children, actions }: ModalProps) {
  const close = useRef<HTMLButtonElement>(null);
  const onEscape = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === "Escape") {
      onClose();
    }
  });

  useEffect(() => {
    close.current?.focus();
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, []);

  return createPortal(
    <div
      className="modal-backdrop"
      onPointerDown={(event) => !actions && event.target === event.currentTarget && onClose()}
    >
      <div className={className ? `modal-card ${className}` : "modal-card"} role="dialog" aria-modal="true" aria-label={label}>
        <h2>{title}</h2>
        {children}
        {actions ?? (
          <button ref={close} type="button" className="hw" onClick={onClose}>
            Close
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
