import { createContext } from "react";
import type { SampleLibrary } from "../samples/sampleLibrary";

/** The audio files the samplers play: where a file loaded goes, and where saving a patch finds them. */
export const SamplesContext = createContext<SampleLibrary | null>(null);
