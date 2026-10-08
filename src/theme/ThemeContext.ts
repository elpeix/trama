import { createContext } from "react";
import type { ThemeState } from "./useTheme";

export const ThemeContext = createContext<ThemeState>({ choice: "system", theme: "light", cycle: () => {} });
