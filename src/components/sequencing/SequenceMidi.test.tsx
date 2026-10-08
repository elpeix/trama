import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readMidi, writeMidi } from "../../patch/midi";
import { moduleRegistry, type SequenceParamDefinition } from "../../patch/registry";
import { paramsInPattern } from "../../patch/patterns";
import { createPatchStore } from "../../store/patchStore";
import { PatchStoreContext } from "../../store/usePatchStore";
import { downloadFile } from "../header/download";
import { SequenceMidi } from "./SequenceMidi";

vi.mock("../header/download", () => ({ downloadFile: vi.fn() }));

let store: ReturnType<typeof createPatchStore>;
const definition = moduleRegistry.sequencer.params.find(
  (param): param is SequenceParamDefinition => param.kind === "sequence",
)!;

beforeEach(() => {
  store = createPatchStore({ sync: vi.fn() });
});

const setup = (params: Record<string, string | number>) => {
  const { id } = store.getState().addNode("sequencer", { x: 0, y: 0 });
  for (const [name, value] of Object.entries(params)) {
    store.getState().updateParam(id, name, value, { merge: false });
  }
  const node = () => store.getState().nodes[0];
  const tree = () => (
    <PatchStoreContext value={store}>
      <SequenceMidi nodeId={id} name="Seq" definition={definition} params={paramsInPattern(node(), "A1")} pattern="A1" />
    </PatchStoreContext>
  );
  const view = render(tree());
  return { node, rerender: () => view.rerender(tree()) };
};

const midiFile = (notes: { note: number; start: number; length: number; velocity?: number }[], beats = 4) =>
  new File([writeMidi(notes, { tempo: 120, beats })], "phrase.mid", { type: "audio/midi" });

describe("SequenceMidi", () => {
  it("shows an arrow and MIDI on each button, and says what it does in a tooltip", () => {
    setup({});
    const exportButton = screen.getByRole("button", { name: "Export MIDI" });
    const importButton = screen.getByRole("button", { name: "Import MIDI" });
    expect(exportButton).toHaveTextContent(/^MIDI$/);
    expect(exportButton.querySelector("svg")).toBeInTheDocument();
    expect(importButton).toHaveTextContent(/^MIDI$/);
    expect(importButton.querySelector("svg")).toBeInTheDocument();

    act(() => exportButton.focus());
    expect(screen.getByRole("tooltip")).toHaveTextContent("Export MIDISave this pattern as a MIDI file, as it sounds");
    act(() => importButton.focus());
    expect(screen.getByRole("tooltip")).toHaveTextContent("Import MIDIPut the notes of a MIDI file in this pattern, a note a step");
  });

  it("saves the pattern as it sounds, its accents as hard as a note goes, with the tempo", async () => {
    setup({ steps: "C4! _ - E4 - - - - - - - - - - - -", length: 8, octave: -1, gate: 0.5 });
    store.getState().setTempo(100);

    await userEvent.click(screen.getByRole("button", { name: "Export MIDI" }));

    const [blob, name] = vi.mocked(downloadFile).mock.lastCall!;
    expect(name).toBe("seq-A1.mid");
    expect(readMidi(new Uint8Array(await blob.arrayBuffer()))).toEqual({
      notes: [
        { note: 48, start: 0, length: 0.375, velocity: 127 },
        { note: 52, start: 0.75, length: 0.125 },
      ],
      tempo: 100,
      beats: 2,
    });
  });

  it("saves the meter of the patch", async () => {
    store.getState().setMeter([3]);
    setup({});

    await userEvent.click(screen.getByRole("button", { name: "Export MIDI" }));

    const [blob] = vi.mocked(downloadFile).mock.lastCall!;
    const bytes = [...new Uint8Array(await blob.arrayBuffer())];
    expect(bytes.join(",")).toContain([0xff, 0x58, 0x04, 0x03, 0x02, 0x18, 0x08].join(","));
  });

  it("saves a meter in eighths", async () => {
    store.getState().setMeter({ eighths: [3, 3, 3, 3] });
    setup({});

    await userEvent.click(screen.getByRole("button", { name: "Export MIDI" }));

    const [blob] = vi.mocked(downloadFile).mock.lastCall!;
    const bytes = [...new Uint8Array(await blob.arrayBuffer())];
    expect(bytes.join(",")).toContain([0xff, 0x58, 0x04, 0x0c, 0x03, 0x24, 0x08].join(","));
  });

  it("puts the notes of a MIDI file on the steps, with the length they need, as one undo step", async () => {
    const { node } = setup({ octave: 1 });
    const before = node();

    await userEvent.upload(
      screen.getByLabelText("Import MIDI file"),
      midiFile(
        [
          { note: 72, start: 0, length: 0.5, velocity: 127 },
          { note: 76, start: 0.75, length: 0.25 },
        ],
        2,
      ),
    );

    // An octave up on the Seq, the steps are an octave under the notes of the file.
    await waitFor(() => expect(node().params.steps).toBe("C4! _ - E4 - - - - - - - - - - - -"));
    expect(node().params.length).toBe(8);
    act(() => store.getState().undo());
    expect(node()).toEqual(before);
  });

  it("says how many notes it left out, and why a file could not be read", async () => {
    setup({});

    await userEvent.upload(
      screen.getByLabelText("Import MIDI file"),
      midiFile([
        { note: 60, start: 0, length: 0.25 },
        { note: 64, start: 0, length: 0.25 },
      ]),
    );
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("1 notes left out"));

    await userEvent.upload(
      screen.getByLabelText("Import MIDI file"),
      new File(["not midi"], "notes.txt", { type: "audio/midi" }),
    );
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("This is not a MIDI file"));
  });
});
