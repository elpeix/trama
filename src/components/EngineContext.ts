import { createContext } from "react";
import type { AudioEngine } from "../audio/AudioEngine";

export type DisplayEngine = Pick<AudioEngine, "getAnalyser" | "getProbe" | "getNotes" | "getPosition" | "getBeat" | "getSongBar" | "getModulation" | "getKeyTranspose" | "getInputStatus" | "isOutputMuted" | "unmuteOutput" | "getVoiceUsage" | "getSample" | "getPattern" | "launchPattern" | "previewNote" | "stopPreview">;

export const EngineContext = createContext<DisplayEngine | null>(null);
