import type { ReactNode } from "react";

/** A 16 × 16 line icon drawn with the current text colour. */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="icon"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const PlayIcon = () => (
  <Icon>
    <path d="M5 3.2v9.6L12.6 8z" fill="currentColor" />
  </Icon>
);

export const StopIcon = () => (
  <Icon>
    <rect x="4" y="4" width="8" height="8" rx="1" fill="currentColor" />
  </Icon>
);

export const RecordIcon = () => (
  <Icon>
    <circle cx="8" cy="8" r="4.5" fill="currentColor" />
  </Icon>
);

export const UndoIcon = () => (
  <Icon>
    <path d="M5.5 3.5 2.5 6.5l3 3" />
    <path d="M2.5 6.5h7a3.5 3.5 0 0 1 0 7H7" />
  </Icon>
);

export const RedoIcon = () => (
  <Icon>
    <path d="m10.5 3.5 3 3-3 3" />
    <path d="M13.5 6.5h-7a3.5 3.5 0 0 0 0 7H9" />
  </Icon>
);

export const NewIcon = () => (
  <Icon>
    <path d="M9.5 2H4.5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V5z" />
    <path d="M9.5 2v3h3" />
    <path d="M8 7.5v4M6 9.5h4" />
  </Icon>
);

export const SaveIcon = () => (
  <Icon>
    <path d="M8 2.5v7.5" />
    <path d="m5 7 3 3 3-3" />
    <path d="M2.5 11v1.5a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V11" />
  </Icon>
);

export const LoadIcon = () => (
  <Icon>
    <path d="M8 10V2.5" />
    <path d="m5 5.5 3-3 3 3" />
    <path d="M2.5 11v1.5a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V11" />
  </Icon>
);

export const ExamplesIcon = () => (
  <Icon>
    <path d="M2.5 3.5h4a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 0-1.5-1.5h-4z" />
    <path d="M13.5 3.5h-4A1.5 1.5 0 0 0 8 5v8a1.5 1.5 0 0 1 1.5-1.5h4z" />
  </Icon>
);

export const AddIcon = () => (
  <Icon>
    <path d="M8 3v10M3 8h10" />
  </Icon>
);

/** Presets: a stack of settings, like cards. */
export const PresetsIcon = () => (
  <Icon>
    <path d="M3 5.5h10M3 8.5h10M3 11.5h6" />
  </Icon>
);

/** Sound: a speaker with its waves. */
export const SoundIcon = () => (
  <Icon>
    <path d="M2.5 6.2h2.3L8 3.5v9L4.8 9.8H2.5z" />
    <path d="M10.4 6a3 3 0 0 1 0 4M12.3 4.2a5.6 5.6 0 0 1 0 7.6" />
  </Icon>
);

/** Composer: a window with a panel open under it. */
export const ComposerIcon = () => (
  <Icon>
    <rect x="2.5" y="3" width="11" height="10" rx="1.5" />
    <path d="M2.5 9h11" />
    <path d="M5 11h2M9 11h2" />
  </Icon>
);

/** Loop: two arrows going round. */
export const LoopIcon = () => (
  <Icon>
    <path d="M3.5 7.5V6a2 2 0 0 1 2-2h7" />
    <path d="M10.5 2l2 2-2 2" />
    <path d="M12.5 8.5V10a2 2 0 0 1-2 2h-7" />
    <path d="M5.5 14l-2-2 2-2" />
  </Icon>
);

export const EditIcon = () => (
  <Icon>
    <path d="M10.5 3 13 5.5 6 12.5 3 13l.5-3z" />
    <path d="M9 4.5 11.5 7" />
  </Icon>
);
