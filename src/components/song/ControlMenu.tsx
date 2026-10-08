import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { ControlKey } from "../../patch/automation";
import { songControls } from "../../patch/songControls";
import { usePatchStoreApi } from "../../store/usePatchStore";
import { searchEntries } from "../header/moduleSearch";

const GAP = 4;
const MARGIN = 8;

/** The "+ Control" button and its menu: the controls of the patch the song does not move yet, with a search field; Enter adds the best match. */
export function ControlMenu({ onChoose }: { onChoose: (key: ControlKey) => void }) {
  const store = usePatchStoreApi();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [place, setPlace] = useState<{ left: number; top: number | "auto"; bottom?: number }>({ left: 0, top: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [entries, setEntries] = useState<{ key: ControlKey; title: string; description: string; group: string }[]>([]);

  useLayoutEffect(() => {
    if (!open || !trigger.current || !panel.current) {
      return;
    }
    const button = trigger.current.getBoundingClientRect();
    const { width, height } = panel.current.getBoundingClientRect();
    const below = button.bottom + GAP + height <= window.innerHeight - MARGIN;
    const left = Math.max(MARGIN, Math.min(button.left, window.innerWidth - width - MARGIN));
    setPlace(below ? { left, top: button.bottom + GAP } : { left, top: "auto", bottom: window.innerHeight - button.top + GAP });
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const outside = (event: Event) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !trigger.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  const toggle = () => {
    if (!open) {
      const { song, toPatch } = store.getState();
      const moved = new Set(Object.keys(song?.automation ?? {}));
      setEntries(
        songControls(toPatch())
          .filter(({ key }) => !moved.has(key))
          .map(({ key, label }) => ({ key, title: label, description: "", group: "" })),
      );
      setQuery("");
    }
    setOpen(!open);
  };

  const choose = (key: ControlKey) => {
    setOpen(false);
    onChoose(key);
  };

  const found = searchEntries(query, entries);

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && found.length > 0) {
      event.preventDefault();
      choose(found[0].key);
    } else if (event.key === "Escape" && query) {
      event.stopPropagation();
      setQuery("");
    }
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="hw clip-editor-action"
        aria-label="Add a control"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Add a control of the patch to the song, on its value in the patch"
        onClick={toggle}
      >
        + Control
      </button>
      {open &&
        createPortal(
          <div
            ref={panel}
            className="examples-menu-panel control-menu"
            role="dialog"
            aria-label="Add a control"
            style={{ ...place, maxHeight: `calc(100vh - ${2 * MARGIN}px)` }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setOpen(false);
                trigger.current?.focus();
              }
            }}
          >
            <input
              className="examples-menu-search"
              type="search"
              aria-label="Search controls"
              placeholder="Search controls"
              autoComplete="off"
              spellCheck={false}
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onSearchKeyDown}
            />
            <div className="examples-menu-list">
              <ul className="examples-menu-items">
                {found.map(({ key, title }) => (
                  <li key={key}>
                    <button type="button" className="examples-menu-item" title={key} onClick={() => choose(key)}>
                      <span className="examples-menu-title">{title}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {found.length === 0 && (
                <p className="examples-menu-empty">
                  {query.trim() ? `No control matches “${query.trim()}”` : "Every control is already in the song"}
                </p>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
