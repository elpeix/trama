import { useCallback, useEffect, useState } from "react";
import { applyTheme, nextThemeChoice, readThemeChoice, resolveTheme, saveThemeChoice, type Theme, type ThemeChoice } from "./theme";

const SYSTEM_DARK = "(prefers-color-scheme: dark)";

let systemQuery: MediaQueryList | undefined | null = null;

/** The query of the theme of the system, asked once; undefined where the browser cannot tell. */
export const systemDarkQuery = () => {
  if (systemQuery === null) {
    systemQuery = typeof window.matchMedia === "function" ? window.matchMedia(SYSTEM_DARK) : undefined;
  }
  return systemQuery;
};

export const themeStorage = () => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

export interface ThemeState {
  choice: ThemeChoice;
  theme: Theme;
  cycle: () => void;
}

/** The theme chosen in this browser, the one it gives with the system's, and a way to go to the next one; it marks the page. */
export function useTheme(media: MediaQueryList | undefined = systemDarkQuery()): ThemeState {
  const [choice, setChoice] = useState(() => readThemeChoice(themeStorage()));
  const [systemDark, setSystemDark] = useState(() => media?.matches ?? false);

  useEffect(() => {
    if (!media) {
      return;
    }
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [media]);

  const theme = resolveTheme(choice, systemDark);

  useEffect(() => {
    applyTheme(document.documentElement, theme);
  }, [theme]);

  const cycle = useCallback(() => {
    setChoice((current) => {
      const next = nextThemeChoice(current);
      saveThemeChoice(themeStorage(), next);
      return next;
    });
  }, []);

  return { choice, theme, cycle };
}
