import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type Ref } from "react";
import type { Preset } from "../../patch/presets";
import { MODULE_CATEGORIES, moduleRegistry } from "../../patch/registry";
import type { NodeType } from "../../patch/types";
import { usePatchStore } from "../../store/usePatchStore";
import { usePresets } from "../PresetsContext";
import { searchEntries } from "./moduleSearch";

const moduleTypes = Object.keys(moduleRegistry) as NodeType[];

/** The In and the Out only make sense inside a subpatch. */
const INSIDE_ONLY: readonly NodeType[] = ["inlet", "outlet"];

const MINE = "My modules";

/** A line of the menu: a module, or a subpatch saved as a module of its own. */
interface Entry {
  key: string;
  title: string;
  description: string;
  group: string;
  choose(): void;
}

interface ModuleListProps {
  onChoose(type: NodeType): void;
  /** Adds a subpatch saved as a module of its own; without it, the menu leaves them out. */
  onChoosePreset?(preset: Preset): void;
  /** Escape asks to close and go back to where the menu was opened from; Tab, to close and move on. */
  onClose(key: "Escape" | "Tab"): void;
  className?: string;
  style?: CSSProperties;
  ref?: Ref<HTMLDivElement>;
}

const modulesIn = ({ node }: Preset) => {
  const count = node.patch?.nodes.length ?? 0;
  return `A subpatch of yours, ${count} ${count === 1 ? "module" : "modules"}`;
};

/**
 * The modules to add, one line each and grouped by what they do, with the subpatches saved as
 * modules of their own last, and a search field that narrows them to a single list, the best match
 * first. The arrows move the mark and Enter adds the module marked; what it does shows below.
 */
export function ModuleList({ onChoose, onChoosePreset, onClose, className = "", style, ref }: ModuleListProps) {
  const inside = usePatchStore((state) => state.path.length > 0);
  const { presets } = usePresets();
  const [query, setQuery] = useState("");
  const [marked, setMarked] = useState(0);
  const search = useRef<HTMLInputElement>(null);
  const id = useId();

  const sections = MODULE_CATEGORIES.map((category) => ({
    ...category,
    entries: moduleTypes
      .filter((type) => moduleRegistry[type].category === category.id && (inside || !INSIDE_ONLY.includes(type)))
      .map(
        (type): Entry => ({
          key: type,
          title: moduleRegistry[type].title,
          description: moduleRegistry[type].description,
          group: category.label,
          choose: () => onChoose(type),
        }),
      ),
  }));
  const mine = onChoosePreset
    ? presets
        .filter((preset) => preset.node.type === "subpatch")
        .map(
          (preset): Entry => ({
            key: preset.id,
            title: preset.name,
            description: modulesIn(preset),
            group: MINE,
            choose: () => onChoosePreset(preset),
          }),
        )
    : [];
  const all = [...sections.flatMap((section) => section.entries), ...mine];

  const searching = query.trim() !== "";
  const order = searching ? searchEntries(query, all) : all;
  const current = order[Math.min(marked, order.length - 1)];
  const optionId = (entry: Entry) => `${id}-${entry.key}`;

  useEffect(() => {
    search.current?.focus();
  }, []);

  // The option marked stays in view when the arrows take it past the edge of a list that scrolls.
  const currentId = current && optionId(current);
  useEffect(() => {
    if (currentId) {
      document.getElementById(currentId)?.scrollIntoView?.({ block: "nearest" });
    }
  }, [currentId]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const move = (step: number) => {
      event.preventDefault();
      if (order.length > 0) {
        setMarked((order.indexOf(current) + step + order.length) % order.length);
      }
    };
    switch (event.key) {
      case "ArrowDown":
        return move(1);
      case "ArrowUp":
        return move(-1);
      case "Enter":
        event.preventDefault();
        current?.choose();
        return;
      case "Escape":
        event.preventDefault();
        if (query) {
          setQuery("");
          setMarked(0);
        } else {
          onClose("Escape");
        }
        return;
      case "Tab":
        return onClose("Tab");
    }
  };

  const option = (entry: Entry) => (
    <div
      key={entry.key}
      id={optionId(entry)}
      role="option"
      aria-selected={entry === current}
      aria-label={entry.title}
      aria-description={entry.description}
      className="module-menu-item"
      onMouseEnter={() => setMarked(order.indexOf(entry))}
      onMouseDown={(event) => event.preventDefault()}
      onClick={entry.choose}
    >
      {entry.title}
      {searching && (
        <span className="module-menu-hint" aria-hidden="true">
          {entry.description}
        </span>
      )}
    </div>
  );

  const group = (label: string, entries: Entry[]) => (
    <div key={label} className="module-menu-section" role="group" aria-label={label}>
      <h2 className="module-menu-heading">{label}</h2>
      {entries.map(option)}
    </div>
  );

  return (
    <div ref={ref} className={`module-menu-panel ${className}`} style={style} role="dialog" aria-label="Add module">
      <input
        ref={search}
        className="module-menu-search"
        type="search"
        role="combobox"
        aria-label="Search modules"
        aria-expanded="true"
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={current && optionId(current)}
        placeholder="Search modules"
        autoComplete="off"
        spellCheck={false}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setMarked(0);
        }}
        onKeyDown={onKeyDown}
      />
      <div
        id={`${id}-list`}
        role="listbox"
        aria-label="Modules"
        className={searching ? "module-menu-results" : "module-menu-sections"}
      >
        {searching
          ? order.map(option)
          : sections.map((section) =>
              // The modules of your own go in the last column, under those of the patch.
              section.id === "patch" && mine.length > 0 ? (
                <div key={section.id} className="module-menu-column">
                  {group(section.label, section.entries)}
                  {group(MINE, mine)}
                </div>
              ) : (
                group(section.label, section.entries)
              ),
            )}
        {searching && order.length === 0 && <p className="module-menu-empty">No module matches “{query.trim()}”</p>}
      </div>
      {!searching && (
        <p className="module-menu-description" data-testid="module-description" aria-hidden="true">
          {current?.description ?? ""}
        </p>
      )}
    </div>
  );
}
