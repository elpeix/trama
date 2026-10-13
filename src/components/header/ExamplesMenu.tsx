import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { EXAMPLE_CATEGORIES, EXAMPLES, type Example } from "../../patch/exampleCatalog";
import { ExamplesIcon } from "./icons";
import { searchEntries } from "./moduleSearch";

const NEEDS: Record<NonNullable<Example["needs"]>, string> = {
  keys: "Play the keys",
  microphone: "Uses the microphone",
  midi: "Played from a MIDI device",
};

const entries = EXAMPLES.map((example) => ({
  ...example,
  group: EXAMPLE_CATEGORIES.find(({ id }) => id === example.category)!.label,
}));

/**
 * The "Examples" button and its menu: each example patch, with what it does, to open in place of the
 * patch, in sections by category, and a search field that narrows them to a single list, the best
 * match first, which Enter opens.
 */
export function ExamplesMenu({ onChoose }: { onChoose: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const toggle = () => {
    setOpen((current) => !current);
    setQuery("");
  };

  const choose = (id: string) => {
    setOpen(false);
    onChoose(id);
  };

  const searching = query.trim() !== "";
  const found = searchEntries(query, entries);

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && searching && found.length > 0) {
      event.preventDefault();
      choose(found[0].id);
    } else if (event.key === "Escape" && query) {
      event.stopPropagation();
      setQuery("");
    }
  };

  const item = ({ id, title, description, needs }: Example) => (
    <li key={id}>
      <button type="button" className="examples-menu-item" onClick={() => choose(id)}>
        <span className="examples-menu-title">{title}</span>
        <span className="examples-menu-description">{description}</span>
        {needs && <span className="examples-menu-needs">{NEEDS[needs]}</span>}
      </button>
    </li>
  );

  return (
    <span className="examples-menu" ref={root}>
      <button
        ref={trigger}
        type="button"
        className="hw"
        aria-label="Examples"
        title="Open an example patch (can be undone)"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggle}
      >
        <ExamplesIcon />
      </button>
      {open && (
        <div
          className="examples-menu-panel"
          role="dialog"
          aria-label="Examples"
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
            aria-label="Search examples"
            placeholder="Search examples"
            autoComplete="off"
            spellCheck={false}
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onSearchKeyDown}
          />
          <div className="examples-menu-list">
            {searching ? (
              <ul className="examples-menu-items">{found.map(item)}</ul>
            ) : (
              EXAMPLE_CATEGORIES.map(({ id, label }) => (
                <section key={id} className="examples-menu-section" role="group" aria-label={label}>
                  <h2 className="examples-menu-heading">{label}</h2>
                  <ul className="examples-menu-items">{entries.filter((entry) => entry.category === id).map(item)}</ul>
                </section>
              ))
            )}
            {searching && found.length === 0 && <p className="examples-menu-empty">No example matches “{query.trim()}”</p>}
          </div>
        </div>
      )}
    </span>
  );
}
