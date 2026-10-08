import { createContext } from "react";

/** Opens the guide to getting started; null where there is none. */
export const GuideContext = createContext<(() => void) | null>(null);
