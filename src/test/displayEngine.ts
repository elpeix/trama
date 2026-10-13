import { vi } from "vitest";
import type { DisplayEngine } from "../components/EngineContext";

/** An engine for components that only read from it, answering nothing unless told otherwise. */
export function displayEngine(overrides: Partial<DisplayEngine> = {}): DisplayEngine {
  return {
    getAnalyser: vi.fn(),
    getProbe: vi.fn(),
    getNotes: vi.fn(),
    getPosition: vi.fn(),
    getBeat: vi.fn(),
    getSongBar: vi.fn(),
    getModulation: vi.fn(),
    getKeyTranspose: vi.fn(),
    getInputStatus: vi.fn(),
    getMidiState: vi.fn(),
    isOutputMuted: vi.fn(() => false),
    unmuteOutput: vi.fn(),
    getVoiceUsage: vi.fn(),
    getSample: vi.fn(),
    getPattern: vi.fn(),
    launchPattern: vi.fn(),
    previewNote: vi.fn(),
    stopPreview: vi.fn(),
    ...overrides,
  };
}
