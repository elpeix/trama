import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { Position } from "../../patch/types";

interface PinMenuProps {
  label: string;
  /** Where the knob was clicked, on the screen. */
  at: Position;
  pinned: boolean;
  onToggle: () => void;
  onClose: () => void;
}

/** The menu of a right click on a knob, to pin it to the perform panel or unpin it. */
export function PinMenu({ label, at, pinned, onToggle, onClose }: PinMenuProps) {
  const root = useRef<HTMLDivElement>(null);
  const item = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    item.current?.focus();
    const outside = (event: Event) => {
      if (!root.current?.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("wheel", outside);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("wheel", outside);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={root}
      className="pin-menu"
      role="menu"
      aria-label={label}
      style={{ left: at.x, top: at.y }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <button
        ref={item}
        type="button"
        role="menuitem"
        className="pin-menu-item"
        onClick={() => {
          onToggle();
          onClose();
        }}
      >
        {pinned ? "Unpin from Perform" : "Pin to Perform"}
      </button>
    </div>,
    document.body,
  );
}
