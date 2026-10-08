import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { documentTitle, isSafeLink, META_LIMITS } from "../../patch/meta";
import type { PatchMeta, Position } from "../../patch/types";
import { usePatchStore } from "../../store/usePatchStore";
import { EditIcon } from "./icons";

const GAP = 6;
const MARGIN = 8;

type Draft = Required<PatchMeta>;

const draftOf = (meta: PatchMeta | undefined): Draft => ({
  title: meta?.title ?? "",
  author: meta?.author ?? "",
  description: meta?.description ?? "",
  link: meta?.link ?? "",
});

/**
 * The title and the author of the piece on the bar, which open a card to edit them, with what it
 * is about and a link. The tab of the browser takes the title too.
 */
export function PieceInfo() {
  const meta = usePatchStore((state) => state.meta);
  const setMeta = usePatchStore((state) => state.setMeta);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [place, setPlace] = useState<Position>({ x: 0, y: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const open = draft !== null;

  useEffect(() => {
    document.title = documentTitle(meta);
  }, [meta]);

  useLayoutEffect(() => {
    if (!open || !trigger.current || !card.current) {
      return;
    }
    const button = trigger.current.getBoundingClientRect();
    const { width } = card.current.getBoundingClientRect();
    setPlace({ x: Math.max(MARGIN, Math.min(button.left, window.innerWidth - width - MARGIN)), y: button.bottom + GAP });
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const outside = (event: Event) => {
      const target = event.target as Node;
      if (!card.current?.contains(target) && !trigger.current?.contains(target)) {
        setDraft(null);
      }
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  const change = (field: keyof Draft, value: string) => {
    setDraft((current) => current && { ...current, [field]: value });
    setMeta({ [field]: value });
  };

  const title = meta?.title ?? "Untitled";
  const label = `Piece: ${title}${meta?.author ? `, by ${meta.author}` : ""}`;
  const field = (name: keyof Draft, text: string, multiline = false) => (
    <label className="piece-field">
      <span className="param-label">{text}</span>
      {multiline ? (
        <textarea
          aria-label={text}
          rows={3}
          maxLength={META_LIMITS[name]}
          value={draft![name]}
          onChange={(event) => change(name, event.target.value)}
        />
      ) : (
        <input
          aria-label={text}
          type={name === "link" ? "url" : "text"}
          maxLength={META_LIMITS[name]}
          value={draft![name]}
          onChange={(event) => change(name, event.target.value)}
        />
      )}
    </label>
  );

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="piece-info"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="The title, author, description and link of the piece"
        onClick={() => setDraft((current) => (current ? null : draftOf(meta)))}
      >
        <span className="piece-text">
          <span className={meta?.title ? "piece-title" : "piece-title piece-untitled"}>{title}</span>
          {meta?.author && <span className="piece-author">{meta.author}</span>}
        </span>
        <span className="piece-edit-icon">
          <EditIcon />
        </span>
      </button>
      {draft &&
        createPortal(
          <div
            ref={card}
            className="piece-card"
            role="dialog"
            aria-label="Piece"
            style={{ left: place.x, top: place.y }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setDraft(null);
                trigger.current?.focus();
              }
            }}
          >
            {field("title", "Title")}
            {field("author", "Author")}
            {field("description", "About", true)}
            {field("link", "Link")}
            {meta?.link && isSafeLink(meta.link) ? (
              <a className="piece-link" href={meta.link} target="_blank" rel="noopener noreferrer" aria-label="Open the link">
                {meta.link} ↗
              </a>
            ) : (
              draft.link.trim() !== "" && <p className="piece-hint">Only web links, starting with http:// or https://, open</p>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
