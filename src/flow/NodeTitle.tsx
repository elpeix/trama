import { useState, type KeyboardEvent } from "react";
import { NODE_NAME_MAX_LENGTH } from "../patch/types";

interface NodeTitleProps {
  title: string;
  name?: string;
  onRename: (name: string) => void;
}

export function NodeTitle({ title, name, onRename }: NodeTitleProps) {
  const [draft, setDraft] = useState<string | null>(null);

  const finish = (save: boolean) => {
    if (draft !== null && save) {
      onRename(draft);
    }
    setDraft(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      finish(true);
    } else if (event.key === "Escape") {
      finish(false);
    }
  };

  if (draft !== null) {
    return (
      <input
        className="module-name-input nodrag"
        aria-label="Name"
        value={draft}
        placeholder={title}
        maxLength={NODE_NAME_MAX_LENGTH}
        autoFocus
        onFocus={(event) => event.target.select()}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => finish(true)}
      />
    );
  }

  return (
    <span className="module-title" title="Double-click to rename" onDoubleClick={() => setDraft(name ?? "")}>
      {name ? (
        <>
          <span className="module-name">{name}</span>
          <span className="module-type">{title}</span>
        </>
      ) : (
        title
      )}
    </span>
  );
}
