import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Position } from "../../patch/types";

export interface MenuAction {
  label: string;
  title: string;
  disabled?: boolean;
  onSelect: () => void;
}

const GAP = 4;
const MARGIN = 8;

/** A "⋯" button with a menu of the actions used now and then, which closes once one is chosen. */
export function ActionsMenu({ label, actions }: { label: string; actions: MenuAction[] }) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<Position>({ x: 0, y: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !trigger.current || !menu.current) {
      return;
    }
    const button = trigger.current.getBoundingClientRect();
    const { width, height } = menu.current.getBoundingClientRect();
    const below = button.bottom + GAP + height <= window.innerHeight - MARGIN;
    setPlace({
      x: Math.max(MARGIN, Math.min(button.left, window.innerWidth - width - MARGIN)),
      y: below ? button.bottom + GAP : Math.max(MARGIN, button.top - GAP - height),
    });
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    menu.current?.querySelector<HTMLButtonElement>("[role=menuitem]:not(:disabled)")?.focus();
    const outside = (event: Event) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !trigger.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="hw clip-editor-action actions-menu-trigger"
        aria-label={`More ${label.toLowerCase()}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        onClick={() => setOpen((current) => !current)}
      >
        ⋯
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            className="pin-menu actions-menu"
            role="menu"
            aria-label={label}
            style={{ left: place.x, top: place.y }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setOpen(false);
                trigger.current?.focus();
              }
            }}
          >
            {actions.map(({ label: name, title, disabled, onSelect }) => (
              <button
                key={name}
                type="button"
                role="menuitem"
                className="pin-menu-item"
                title={title}
                disabled={disabled}
                onClick={() => {
                  onSelect();
                  setOpen(false);
                }}
              >
                {name}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
