import { useContext } from "react";
import { nextThemeChoice, type ThemeChoice } from "./theme";
import { ThemeContext } from "./ThemeContext";

const ICONS: Record<ThemeChoice, string> = {
  system: "M8 2.5a5.5 5.5 0 1 0 0 11zM8 2.5a5.5 5.5 0 1 1 0 11",
  light: "M8 5a3 3 0 1 0 0 6a3 3 0 1 0 0-6M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1",
  dark: "M13 9.5A5.5 5.5 0 1 1 6.5 3a4.5 4.5 0 0 0 6.5 6.5z",
};

/** Goes through the themes: the system's, light and dark. */
export function ThemeButton() {
  const { choice, cycle } = useContext(ThemeContext);

  return (
    <button
      type="button"
      className="hw theme-button"
      aria-label={`Theme: ${choice}`}
      title={`Theme: ${choice === "system" ? "follows the system" : choice}; click for ${nextThemeChoice(choice)}`}
      onClick={cycle}
    >
      <svg className="icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={ICONS[choice]} fill={choice === "system" ? undefined : "none"} />
        {choice === "system" && <path d="M8 2.5a5.5 5.5 0 1 0 0 11z" fill="currentColor" stroke="none" />}
      </svg>
    </button>
  );
}
