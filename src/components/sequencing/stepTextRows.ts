import type { NotesParamDefinition, RhythmParamDefinition } from "../../patch/registry";
import { readNotesText, readRhythmText } from "../../patch/stepText";
import type { Params } from "../../patch/types";
import type { StepTextRow } from "./StepTextDialog";

/** A row of steps of a node, to write as text. */
export const rhythmTextRow = (rhythm: RhythmParamDefinition, params: Params): StepTextRow => ({
  id: rhythm.id,
  label: rhythm.label,
  value: String(params[rhythm.id]),
  read: (text) => readRhythmText(text, rhythm),
});

/** The notes a node plays of its own, to write as text beside its steps. */
export const notesTextRow = (notes: NotesParamDefinition, params: Params): StepTextRow => ({
  id: notes.id,
  label: notes.label,
  value: String(params[notes.id]),
  read: (text) => readNotesText(text, notes),
  steps: false,
});
