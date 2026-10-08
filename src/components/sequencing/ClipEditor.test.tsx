import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../header/download", () => ({ downloadFile: vi.fn() }));
import { createPatchStore } from "../../store/patchStore";
import { PatchStoreContext } from "../../store/usePatchStore";
import { displayEngine } from "../../test/displayEngine";
import { ClipEditor, HEAR_KEY } from "./ClipEditor";
import { EngineContext } from "../EngineContext";
import { KeysContext } from "../keys/KeysContext";
import { downloadFile } from "../header/download";
import { readMidi, writeMidi } from "../../patch/midi";
import type { KeysState } from "../keys/useComputerKeyboard";

let store: ReturnType<typeof createPatchStore>;

const BEAT = 40;
const ROW = 16;
const HIGHEST = 96;

beforeEach(() => {
  store = createPatchStore({ sync: vi.fn() });
  localStorage.clear();
  Element.prototype.setPointerCapture ??= () => {};
});

const setup = (notes: string, position?: number) => {
  const { id } = store.getState().addNode("clip", { x: 0, y: 0 });
  store.getState().updateParam(id, "notes", notes, { merge: false });
  store.getState().openClipEditor([id]);
  const engine = displayEngine({ getPosition: vi.fn(() => position) });
  render(
    <PatchStoreContext value={store}>
      <EngineContext value={engine}>
        <ClipEditor path={[id]} />
      </EngineContext>
    </PatchStoreContext>,
  );
  const roll = screen.getByRole("application", { name: "Piano roll" });
  vi.spyOn(roll, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0 } as DOMRect);
  return { id, roll };
};

const at = (beat: number, note: number) => ({ clientX: beat * BEAT, clientY: (HIGHEST - note) * ROW + ROW / 2 });
const notes = () => store.getState().nodes[0].params.notes;

type Point = { clientX: number; clientY: number };

function gesture(
  roll: HTMLElement,
  from: Point,
  to?: Point | Point[],
  button = 0,
  keys: { shiftKey?: boolean; altKey?: boolean } = {},
) {
  fireEvent.pointerDown(roll, { ...from, ...keys, pointerId: 1, button, buttons: button === 2 ? 2 : 1 });
  const path = to === undefined ? [] : Array.isArray(to) ? to : [to];
  for (const point of path) {
    fireEvent.pointerMove(roll, { ...point, pointerId: 1, buttons: button === 2 ? 2 : 1 });
  }
  fireEvent.pointerUp(roll, { ...(path.at(-1) ?? from), pointerId: 1, button });
}

describe("ClipEditor", () => {
  it("names the clip it edits", () => {
    setup("");

    expect(screen.getByRole("region", { name: "Clip clip-1" })).toBeInTheDocument();
  });

  it("draws a note on an empty place, as long as the pointer is dragged, as one undo step", () => {
    const { roll } = setup("");

    gesture(roll, at(1.1, 62), at(2.6, 62));

    expect(notes()).toBe("D4@1+1.75");
    store.getState().undo();
    expect(notes()).toBe("");
  });

  it("moves a note by dragging it, in time and in pitch", () => {
    const { roll } = setup("C4@0+1");

    gesture(roll, at(0.3, 60), at(2.3, 64));

    expect(notes()).toBe("E4@2+1");
  });

  it("changes the length of a note by dragging its right edge", () => {
    const { roll } = setup("C4@0+1");

    gesture(roll, at(0.95, 60), at(3.1, 60));

    expect(notes()).toBe("C4@0+3.25");
  });

  it("removes a note on a double-click", () => {
    const { roll } = setup("C4@0+1 E4@1+1");

    fireEvent.doubleClick(roll, at(1.5, 64));

    expect(notes()).toBe("C4@0+1");
  });

  it("removes a note on a right-click", () => {
    const { roll } = setup("C4@0+1 E4@1+1");

    gesture(roll, at(1.5, 64), undefined, 2);

    expect(notes()).toBe("C4@0+1");
  });

  it("erases every note a drag with the right button goes over, as one undo step", () => {
    const { roll } = setup("C4@0+1 C4@1+1 C4@2+1 C4@3+1");

    gesture(roll, at(0.5, 60), [at(1.5, 60), at(2.5, 60)], 2);

    expect(notes()).toBe("C4@3+1");
    store.getState().undo();
    expect(notes()).toBe("C4@0+1 C4@1+1 C4@2+1 C4@3+1");
  });

  it("draws a note on a click as long as the last note touched", () => {
    const { roll } = setup("C4@0+1.5");

    gesture(roll, at(0.5, 60));
    gesture(roll, at(2.1, 64));

    expect(notes()).toBe("C4@0+1.5 E4@2+1.5");
  });

  it("keeps a new note as long as the last one when the pointer barely moves", () => {
    const { roll } = setup("C4@0+2");

    gesture(roll, at(0.5, 60));
    const from = at(2.1, 64);
    gesture(roll, from, { ...from, clientX: from.clientX + 1 });

    expect(notes()).toBe("C4@0+2 E4@2+2");
  });

  it("moves a short note by its middle rather than stretching it", () => {
    const { roll } = setup("C4@0+0.125");

    gesture(roll, at(0.06, 60), at(1.06, 60));

    expect(notes()).toBe("C4@1+0.125");
  });

  it("clears all the notes as one undo step", async () => {
    setup("C4@0+1 E4@1+1");

    await userEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(notes()).toBe("");
    expect(screen.getByRole("button", { name: "Clear" })).toBeDisabled();
    store.getState().undo();
    expect(notes()).toBe("C4@0+1 E4@1+1");
  });

  it("lights the key of the note under the pointer, until it leaves the roll", () => {
    const { roll } = setup("");
    const lit = () => [...document.querySelectorAll(".clip-key[data-hovered]")].map((key) => key.textContent);

    fireEvent.pointerMove(roll, { ...at(14, 64), pointerId: 1 });
    expect(lit()).toEqual(["E4"]);

    fireEvent.pointerLeave(roll, { pointerId: 1 });
    expect(lit()).toEqual([]);
  });

  it("numbers the bars", () => {
    const { id } = setup("");
    act(() => store.getState().updateParam(id, "bars", 3, { merge: false }));

    expect(screen.getByLabelText("Bars")).toHaveTextContent("123");
  });

  it("marks the bars of the meter on its ruler", () => {
    store.getState().setMeter([3]);
    const { id } = setup("");
    act(() => store.getState().updateParam(id, "bars", 3, { merge: false }));

    const marks = [...screen.getByLabelText("Bars").querySelectorAll<HTMLElement>(".clip-bar")];
    expect(marks.map((mark) => mark.style.left)).toEqual(["0px", `${3 * BEAT}px`, `${6 * BEAT}px`]);
  });

  it("is made taller from the keys on its top edge", async () => {
    setup("");
    const edge = screen.getByRole("separator", { name: "Resize piano roll" });
    const before = Number(edge.getAttribute("aria-valuenow"));

    edge.focus();
    await userEvent.keyboard("{ArrowUp}");

    expect(Number(edge.getAttribute("aria-valuenow"))).toBe(before + 20);
    expect(screen.getByRole("region", { name: "Clip clip-1" }).style.height).toBe(`${before + 20}px`);
  });

  it("puts the notes on the grid chosen", async () => {
    const { roll } = setup("");

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Snap" }), "1/4");
    gesture(roll, at(1.6, 60));

    expect(notes()).toBe("C4@1+1");
  });

  it("closes", async () => {
    setup("");

    await userEvent.click(screen.getByRole("button", { name: "Close piano roll" }));

    expect(store.getState().clipEditor).toBeUndefined();
  });

  it("shows where the clip is while it plays", async () => {
    setup("", 2.5);

    await waitFor(() =>
      expect(screen.getByTestId("clip-playhead")).toHaveStyle({ transform: `translateX(${2.5 * BEAT}px)` }),
    );
  });
});

describe("ClipEditor patterns", () => {
  it("edits the pattern it was opened on, with its own length, leaving pattern A as it was", () => {
    const { id } = store.getState().addNode("clip", { x: 0, y: 0 });
    store.getState().updateParam(id, "notes", "C4@0+1", { merge: false });
    store.getState().updateParam(id, "bars", 1, { merge: false, pattern: "A2" });
    store.getState().updateParam(id, "notes", "", { merge: false, pattern: "A2" });
    store.getState().openClipEditor([id], "A2");
    render(
      <PatchStoreContext value={store}>
        <ClipEditor path={[id]} />
      </PatchStoreContext>,
    );
    const roll = screen.getByRole("application", { name: "Piano roll" });
    vi.spyOn(roll, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0 } as DOMRect);

    expect(screen.getByLabelText("Pattern edited")).toHaveTextContent("Pattern A2");
    expect(roll.style.width).toBe(`${4 * BEAT}px`);
    gesture(roll, at(1.1, 62), at(2.6, 62));

    const node = store.getState().nodes[0];
    expect(node.patterns?.A2?.notes).toBe("D4@1+1.75");
    expect(node.params.notes).toBe("C4@0+1");
  });

  it("edits a clip inside a subpatch, wherever the editor is, on the pattern it was opened on", () => {
    const subpatch = store.getState().addNode("subpatch", { x: 0, y: 0 });
    store.getState().openSubpatch(subpatch.id);
    const { id } = store.getState().addNode("clip", { x: 0, y: 0 });
    store.getState().updateParam(id, "bars", 1, { merge: false, pattern: "A2" });
    store.getState().updateParam(id, "notes", "", { merge: false, pattern: "A2" });
    store.getState().closeSubpatch(0);
    store.getState().openClipEditor([subpatch.id, id], "A2");
    render(
      <PatchStoreContext value={store}>
        <ClipEditor path={[subpatch.id, id]} />
      </PatchStoreContext>,
    );
    const roll = screen.getByRole("application", { name: "Piano roll" });
    vi.spyOn(roll, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0 } as DOMRect);

    expect(roll.style.width).toBe(`${4 * BEAT}px`);
    gesture(roll, at(1.1, 62), at(2.6, 62));

    expect(store.getState().nodes[0].patch!.nodes[0].patterns?.A2?.notes).toBe("D4@1+1.75");
  });
});

describe("ClipEditor selection", () => {
  const selected = () =>
    [...document.querySelectorAll(".clip-note")].flatMap((note, index) =>
      note.hasAttribute("data-selected") ? [index] : [],
    );

  it("selects the note clicked, and the one drawn", () => {
    const { roll } = setup("C4@0+1 E4@1+1");

    gesture(roll, at(1.5, 64));
    expect(selected()).toEqual([1]);

    gesture(roll, at(3.1, 67));
    expect(selected()).toEqual([2]);
  });

  it("adds a note to the selection or takes it out with Shift and a click", () => {
    const { roll } = setup("C4@0+1 E4@1+1 G4@2+1");

    gesture(roll, at(0.5, 60));
    gesture(roll, at(2.5, 67), undefined, 0, { shiftKey: true });
    expect(selected()).toEqual([0, 2]);

    gesture(roll, at(0.5, 60), undefined, 0, { shiftKey: true });
    expect(selected()).toEqual([2]);
  });

  it("selects the notes in a box drawn with Shift on an empty place", () => {
    const { roll } = setup("C4@0+1 E4@1+1 G4@2+1");

    gesture(roll, at(0.5, 68), at(2.5, 63), 0, { shiftKey: true });

    expect(selected()).toEqual([1, 2]);
    expect(notes()).toBe("C4@0+1 E4@1+1 G4@2+1");
    expect(screen.queryByTestId("clip-box")).toBeNull();
  });

  it("moves the selected notes together, and changes their lengths together", () => {
    const { roll } = setup("C4@0+1 E4@1+1 G4@2+1");

    gesture(roll, at(0.5, 60));
    gesture(roll, at(1.5, 64), undefined, 0, { shiftKey: true });
    gesture(roll, at(1.5, 64), at(2.5, 66));
    expect(notes()).toBe("D4@1+1 F#4@2+1 G4@2+1");

    gesture(roll, at(1.95, 62), at(2.45, 62));
    expect(notes()).toBe("D4@1+1.5 F#4@2+1.5 G4@2+1");
    expect(selected()).toEqual([0, 1]);
  });

  it("keeps only the note clicked, of those selected, when it is not dragged", () => {
    const { roll } = setup("C4@0+1 E4@1+1");

    fireEvent.keyDown(roll, { key: "a", ctrlKey: true });
    gesture(roll, at(1.5, 64));

    expect(selected()).toEqual([1]);
  });

  it("drags a copy of the selected notes with Alt", () => {
    const { roll } = setup("C4@0+1 E4@1+1");

    gesture(roll, at(0.5, 60), at(2.5, 60), 0, { altKey: true });

    expect(notes()).toBe("C4@0+1 E4@1+1 C4@2+1");
    expect(selected()).toEqual([2]);
  });

  it("deletes, moves and transposes the selected notes from the keys", () => {
    const { roll } = setup("C4@0+1 E4@1+1 G4@2+1");

    gesture(roll, at(0.5, 60));
    gesture(roll, at(1.5, 64), undefined, 0, { shiftKey: true });
    fireEvent.keyDown(roll, { key: "ArrowRight" });
    expect(notes()).toBe("C4@0.25+1 E4@1.25+1 G4@2+1");
    fireEvent.keyDown(roll, { key: "ArrowUp", shiftKey: true });
    expect(notes()).toBe("C5@0.25+1 E5@1.25+1 G4@2+1");
    fireEvent.keyDown(roll, { key: "Delete" });
    expect(notes()).toBe("G4@2+1");
    store.getState().undo();
    expect(notes()).toBe("C5@0.25+1 E5@1.25+1 G4@2+1");
  });

  it("lets the selection go on Escape", () => {
    const { roll } = setup("C4@0+1");

    gesture(roll, at(0.5, 60));
    fireEvent.keyDown(roll, { key: "Escape" });

    expect(selected()).toEqual([]);
  });

  it("copies the selected notes and pastes them where the pointer is", () => {
    const { roll } = setup("C4@0+1 E4@1+1");

    fireEvent.keyDown(roll, { key: "a", ctrlKey: true });
    fireEvent.keyDown(roll, { key: "c", ctrlKey: true });
    fireEvent.pointerMove(roll, { ...at(4.1, 60), pointerId: 1 });
    fireEvent.keyDown(roll, { key: "v", ctrlKey: true });

    expect(notes()).toBe("C4@0+1 E4@1+1 C4@4+1 E4@5+1");
    expect(selected()).toEqual([2, 3]);
  });

  it("cuts the selected notes", () => {
    const { roll } = setup("C4@0+1 E4@1+1");

    gesture(roll, at(0.5, 60));
    fireEvent.keyDown(roll, { key: "x", ctrlKey: true });
    fireEvent.pointerLeave(roll, { pointerId: 1 });
    fireEvent.keyDown(roll, { key: "v", ctrlKey: true });

    expect(notes()).toBe("C4@0+1 E4@1+1");
  });

  it("duplicates the selected notes right after them", () => {
    const { roll } = setup("C4@0+1 E4@1+1");

    fireEvent.keyDown(roll, { key: "a", ctrlKey: true });
    fireEvent.keyDown(roll, { key: "d", ctrlKey: true });

    expect(notes()).toBe("C4@0+1 E4@1+1 C4@2+1 E4@3+1");
    expect(selected()).toEqual([2, 3]);
  });

  it("keeps the keys it uses from the rest of the page", () => {
    const { roll } = setup("C4@0+1");
    const page = vi.fn();
    window.addEventListener("keydown", page);

    gesture(roll, at(0.5, 60));
    fireEvent.keyDown(roll, { key: "Backspace" });
    fireEvent.keyDown(roll, { key: "c", ctrlKey: true });
    fireEvent.keyDown(roll, { key: "z", ctrlKey: true });

    window.removeEventListener("keydown", page);
    expect(page.mock.calls.map(([event]) => (event as KeyboardEvent).key)).toEqual(["z"]);
  });

  it("drops the selection on undo", () => {
    const { roll } = setup("C4@0+1");

    gesture(roll, at(0.5, 60), at(1.5, 60));
    act(() => store.getState().undo());

    expect(selected()).toEqual([]);
  });
});

describe("ClipEditor tools", () => {
  it("lights the notes of a scale, and its root, on the keys and the rows", async () => {
    setup("");
    const key = (name: string) => [...document.querySelectorAll(".clip-key")].find((key) => key.textContent === name)!;
    expect(screen.getByRole("combobox", { name: "Root" })).toBeDisabled();

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Scale" }), "minor");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Root" }), "A");

    expect(key("A3").getAttribute("data-degree")).toBe("root");
    expect(key("C4").getAttribute("data-degree")).toBe("in");
    expect(key("C#4").getAttribute("data-degree")).toBe("out");
    expect(document.querySelectorAll(".clip-row[data-degree='root']")).toHaveLength(6);

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Scale" }), "off");
    expect(key("A3").hasAttribute("data-degree")).toBe(false);
  });

  it("quantizes the selected notes, or all of them, as one undo step", async () => {
    const { roll } = setup("C4@0.1+1 E4@1.2+1");

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Snap" }), "1/4");
    gesture(roll, at(1.5, 64));
    await userEvent.click(screen.getByRole("button", { name: "Quantize" }));
    expect(notes()).toBe("C4@0.1+1 E4@1+1");

    fireEvent.keyDown(roll, { key: "Escape" });
    await userEvent.click(screen.getByRole("button", { name: "Quantize" }));
    expect(notes()).toBe("C4@0+1 E4@1+1");
    store.getState().undo();
    expect(notes()).toBe("C4@0.1+1 E4@1+1");
  });

  it("draws notes on a triplet grid", async () => {
    const { roll } = setup("");

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Snap" }), "1/8T");
    gesture(roll, at(0.4, 60));

    expect(notes()).toBe("C4@0.333333+0.333333");
  });

  it("doubles the loop with a copy of its notes, as one undo step", async () => {
    const { id } = setup("C4@0+1 E4@7+1 G4@9+1");
    const before = store.getState().nodes[0];

    await userEvent.click(screen.getByRole("button", { name: "Duplicate loop" }));

    expect(store.getState().nodes[0].params).toMatchObject({ bars: 4, notes: "C4@0+1 E4@7+1 C4@8+1 E4@15+1" });
    store.getState().undo();
    expect(store.getState().nodes[0]).toEqual(before);

    act(() => store.getState().updateParam(id, "bars", 16, { merge: false }));
    expect(screen.getByRole("button", { name: "Duplicate loop" })).toBeDisabled();
  });
});

describe("ClipEditor in other meters", () => {
  it("doubles a loop of bars of the meter", async () => {
    store.getState().setMeter([3]);
    setup("C4@0+1 E4@5+1");

    await userEvent.click(screen.getByRole("button", { name: "Duplicate loop" }));

    expect(store.getState().nodes[0].params).toMatchObject({ bars: 4, notes: "C4@0+1 E4@5+1 C4@6+1 E4@11+1" });
  });

  it("draws a line on each bar of the meter, and one where each group of its beats starts", () => {
    store.getState().setMeter([3, 2]);
    const { id, roll } = setup("");
    act(() => store.getState().updateParam(id, "bars", 2, { merge: false }));

    expect(roll.style.getPropertyValue("--bar")).toBe(`${5 * BEAT}px`);
    const groups = [...roll.querySelectorAll<HTMLElement>(".clip-group-line")].map((line) => line.style.left);
    expect(groups).toEqual([`${3 * BEAT}px`, `${8 * BEAT}px`]);
  });

  it("draws a line on each dotted quarter of a meter in eighths, and none for its groups", () => {
    store.getState().setMeter({ eighths: [3, 3] });
    const { id, roll } = setup("");
    act(() => store.getState().updateParam(id, "bars", 2, { merge: false }));

    expect(roll.style.getPropertyValue("--bar")).toBe(`${3 * BEAT}px`);
    expect(roll.style.getPropertyValue("--pulse")).toBe(`${1.5 * BEAT}px`);
    expect(roll.querySelectorAll(".clip-group-line")).toHaveLength(0);
  });

  it("draws a line on each beat of a meter in quarters", () => {
    store.getState().setMeter([3, 2]);
    const { roll } = setup("");

    expect(roll.style.getPropertyValue("--pulse")).toBe(`${BEAT}px`);
  });

  it("doubles no further than the longest loop holds in bars of the meter", () => {
    store.getState().setMeter([3, 2]);
    const { id } = setup("C4@0+1");

    act(() => store.getState().updateParam(id, "bars", 6, { merge: false }));
    expect(screen.getByRole("button", { name: "Duplicate loop" })).toBeEnabled();

    act(() => store.getState().updateParam(id, "bars", 7, { merge: false }));
    expect(screen.getByRole("button", { name: "Duplicate loop" })).toBeDisabled();
  });
});

describe("ClipEditor preview", () => {
  const setupHeard = (text: string) => {
    const { id } = store.getState().addNode("clip", { x: 0, y: 0 });
    store.getState().updateParam(id, "notes", text, { merge: false });
    const engine = displayEngine();
    render(
      <PatchStoreContext value={store}>
        <EngineContext value={engine}>
          <ClipEditor path={[id]} />
        </EngineContext>
      </PatchStoreContext>,
    );
    const roll = screen.getByRole("application", { name: "Piano roll" });
    vi.spyOn(roll, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0 } as DOMRect);
    const heard = () => vi.mocked(engine.previewNote).mock.calls.map(([, note]) => `on ${note}`);
    return { id, roll, engine, heard };
  };

  it("plays the note drawn until the pointer is let go", () => {
    const { roll, engine } = setupHeard("");

    fireEvent.pointerDown(roll, { ...at(1, 62), pointerId: 1, button: 0, buttons: 1 });
    expect(engine.previewNote).toHaveBeenCalledWith("clip-1", 62, 100);
    expect(engine.stopPreview).not.toHaveBeenCalled();

    fireEvent.pointerUp(roll, { ...at(1, 62), pointerId: 1 });
    expect(engine.stopPreview).toHaveBeenCalledWith("clip-1");
  });

  it("plays each pitch a note is moved to, once", () => {
    const { roll, heard } = setupHeard("C4@0+1");

    gesture(roll, at(0.5, 60), [at(0.6, 62), at(0.7, 62), at(0.8, 64)]);

    expect(heard()).toEqual(["on 60", "on 62", "on 64"]);
  });

  it("plays a key on the left while it is pressed, and the keys it slides to", () => {
    const { engine, heard } = setupHeard("");
    const keys = screen.getByTestId("clip-keys");
    vi.spyOn(keys, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0 } as DOMRect);
    const key = (note: number) => ({ clientX: 10, clientY: 18 + (HIGHEST - note) * ROW + ROW / 2 });

    fireEvent.pointerDown(keys, { ...key(60), pointerId: 1, button: 0 });
    fireEvent.pointerMove(keys, { ...key(59), pointerId: 1 });
    fireEvent.pointerUp(keys, { ...key(59), pointerId: 1 });

    expect(heard()).toEqual(["on 60", "on 59"]);
    expect(engine.stopPreview).toHaveBeenCalledTimes(1);
  });

  it("plays a note transposed from the keys for a moment", () => {
    vi.useFakeTimers();
    const { roll, engine, heard } = setupHeard("C4@0+1");

    gesture(roll, at(0.5, 60));
    fireEvent.keyDown(roll, { key: "ArrowUp" });
    expect(heard()).toEqual(["on 60", "on 61"]);
    vi.advanceTimersByTime(250);

    expect(engine.stopPreview).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("shows a speaker and Hear on its button", () => {
    setupHeard("");

    const hear = screen.getByRole("button", { name: "Hear" });
    expect(hear).toHaveTextContent(/^Hear$/);
    expect(hear.querySelector("svg")).toBeInTheDocument();
  });

  it("stays quiet while Hear is off", async () => {
    const { roll, engine } = setupHeard("");

    await userEvent.click(screen.getByRole("button", { name: "Hear" }));
    gesture(roll, at(1, 62));

    expect(engine.previewNote).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Hear" })).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(screen.getByRole("button", { name: "Hear" }));
  });

  it("keeps Hear in this browser", async () => {
    setupHeard("");

    await userEvent.click(screen.getByRole("button", { name: "Hear" }));
    expect(localStorage.getItem(HEAR_KEY)).toBe("off");
    await userEvent.click(screen.getByRole("button", { name: "Hear" }));

    expect(localStorage.getItem(HEAR_KEY)).toBe("on");
  });

  it("opens with Hear as this browser left it", () => {
    localStorage.setItem(HEAR_KEY, "off");

    const { roll, engine } = setupHeard("");
    gesture(roll, at(1, 62));

    expect(screen.getByRole("button", { name: "Hear" })).toHaveAttribute("aria-pressed", "false");
    expect(engine.previewNote).not.toHaveBeenCalled();
  });

  it("hears the notes when the browser keeps nothing", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    setupHeard("");

    expect(screen.getByRole("button", { name: "Hear" })).toHaveAttribute("aria-pressed", "true");
    vi.restoreAllMocks();
  });
});

describe("ClipEditor recording", () => {
  const clock = { position: undefined as number | undefined, beat: undefined as number | undefined };

  const setupRecording = (text: string) => {
    const { id } = store.getState().addNode("clip", { x: 0, y: 0 });
    store.getState().updateParam(id, "notes", text, { merge: false });
    clock.position = 1;
    clock.beat = 9;
    const engine = displayEngine({ getPosition: vi.fn(() => clock.position), getBeat: vi.fn(() => clock.beat) });
    const keys = (held: [string, number][]): KeysState => ({
      octave: 0,
      up: false,
      held: new Map(held),
      changeOctave: () => {},
      press: () => {},
      release: () => {},
    });
    const tree = (held: [string, number][]) => (
      <PatchStoreContext value={store}>
        <EngineContext value={engine}>
          <KeysContext value={keys(held)}>
            <ClipEditor path={[id]} />
          </KeysContext>
        </EngineContext>
      </PatchStoreContext>
    );
    const view = render(tree([]));
    const play = (held: [string, number][], position: number, beat: number) => {
      clock.position = position;
      clock.beat = beat;
      view.rerender(tree(held));
    };
    return { engine, play };
  };

  const rec = () => screen.getByRole("button", { name: "Record notes" });

  it("shows a dot and Rec on its button, as the record button of the transport", () => {
    setupRecording("C4@0+1");

    expect(rec()).toHaveTextContent(/^Rec$/);
    expect(rec().querySelector("svg")).toBeInTheDocument();
  });

  it("adds the notes played on the keys while it records, where the loop was, as long as they were held", async () => {
    const { play, engine } = setupRecording("C4@0+1");
    await waitFor(() => expect(rec()).toBeEnabled());
    await userEvent.click(rec());

    play([["a", 60]], 2.5, 10.5);
    expect(engine.previewNote).toHaveBeenCalledWith("clip-1", 60, undefined);
    play(
      [
        ["a", 60],
        ["d", 64],
      ],
      3,
      11,
    );
    play([["d", 64]], 3.5, 11.5);
    play([], 0.5, 12.5);

    expect(notes()).toBe("C4@0+1 C4@2.5+1 E4@3+1.5");
    expect(engine.stopPreview).toHaveBeenCalled();
  });

  it("records nothing while it is off, and ends the notes held when it stops", async () => {
    const { play } = setupRecording("");
    await waitFor(() => expect(rec()).toBeEnabled());

    play([["a", 60]], 2, 10);
    play([], 2.5, 10.5);
    expect(notes()).toBe("");

    await userEvent.click(rec());
    play([["s", 62]], 1, 13);
    clock.beat = 13.75;
    await userEvent.click(rec());

    expect(notes()).toBe("D4@1+0.75");
    expect(rec()).toHaveAttribute("aria-pressed", "false");
  });

  it("can only start recording while the clip plays", async () => {
    setupRecording("");
    clock.position = undefined;

    await waitFor(() => expect(rec()).toBeDisabled());
  });
});

describe("ClipEditor MIDI", () => {
  const midiFile = (notes: { note: number; start: number; length: number }[], name = "phrase.mid") =>
    new File([writeMidi(notes, { tempo: 120, beats: 4 })], name, { type: "audio/midi" });

  it("shows an arrow and MIDI on each button, as the Seq does", () => {
    setup("C4@0+1");

    const exportButton = screen.getByRole("button", { name: "Export MIDI" });
    const importButton = screen.getByRole("button", { name: "Import MIDI" });
    expect(exportButton).toHaveTextContent(/^MIDI$/);
    expect(exportButton.querySelector("svg")).toBeInTheDocument();
    expect(importButton).toHaveTextContent(/^MIDI$/);
    expect(importButton.querySelector("svg")).toBeInTheDocument();
  });

  it("saves the notes that sound in the pattern as a MIDI file, with the tempo", async () => {
    setup("C4@0+1 E4@1+0.5 G4@9+1");
    store.getState().setTempo(90);

    await userEvent.click(screen.getByRole("button", { name: "Export MIDI" }));

    const [blob, name] = vi.mocked(downloadFile).mock.lastCall!;
    expect(name).toBe("clip-A1.mid");
    expect(readMidi(new Uint8Array(await blob.arrayBuffer()))).toEqual({
      notes: [
        { note: 60, start: 0, length: 1 },
        { note: 64, start: 1, length: 0.5 },
      ],
      tempo: 90,
      beats: 8,
    });
  });

  it("saves the loop in bars of the meter, with the meter", async () => {
    store.getState().setMeter([3]);
    setup("C4@0+1");

    await userEvent.click(screen.getByRole("button", { name: "Export MIDI" }));

    const [blob] = vi.mocked(downloadFile).mock.lastCall!;
    const bytes = [...new Uint8Array(await blob.arrayBuffer())];
    expect(readMidi(new Uint8Array(bytes)).beats).toBe(6);
    expect(bytes.join(",")).toContain([0xff, 0x58, 0x04, 0x03, 0x02, 0x18, 0x08].join(","));
  });

  it("saves the loop with a meter in eighths", async () => {
    store.getState().setMeter({ eighths: [3, 3] });
    setup("C4@0+1");

    await userEvent.click(screen.getByRole("button", { name: "Export MIDI" }));

    const [blob] = vi.mocked(downloadFile).mock.lastCall!;
    const bytes = [...new Uint8Array(await blob.arrayBuffer())];
    expect(readMidi(new Uint8Array(bytes)).beats).toBe(6);
    expect(bytes.join(",")).toContain([0xff, 0x58, 0x04, 0x06, 0x03, 0x24, 0x08].join(","));
  });

  it("gives the notes of a MIDI file the bars of the meter they need", async () => {
    store.getState().setMeter([3]);
    setup("C4@0+1");

    await userEvent.upload(screen.getByLabelText("Import MIDI file"), midiFile([{ note: 69, start: 10, length: 2 }]));

    await waitFor(() => expect(notes()).toBe("A4@10+2"));
    expect(store.getState().nodes[0].params.bars).toBe(4);
  });

  it("puts the notes of a MIDI file in the pattern, with the bars they need, as one undo step", async () => {
    setup("C4@0+1");
    const before = store.getState().nodes[0];

    await userEvent.upload(
      screen.getByLabelText("Import MIDI file"),
      midiFile([
        { note: 67, start: 0.5, length: 1 },
        { note: 69, start: 10, length: 2 },
      ]),
    );

    await waitFor(() => expect(notes()).toBe("G4@0.5+1 A4@10+2"));
    expect(store.getState().nodes[0].params.bars).toBe(3);
    expect(screen.queryByRole("alert")).toBeNull();
    act(() => store.getState().undo());
    expect(store.getState().nodes[0]).toEqual(before);
  });

  it("says how many notes it left out, and why a file could not be read", async () => {
    setup("C4@0+1");

    await userEvent.upload(
      screen.getByLabelText("Import MIDI file"),
      midiFile([
        { note: 60, start: 0, length: 1 },
        { note: 12, start: 1, length: 1 },
      ]),
    );
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("1 notes out of C1–C7"));

    await userEvent.upload(
      screen.getByLabelText("Import MIDI file"),
      new File(["not midi"], "notes.txt", { type: "audio/midi" }),
    );
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("This is not a MIDI file"));
    expect(notes()).toBe("C4@0+1");
  });
});

describe("ClipEditor velocity", () => {
  const lane = () => {
    const element = screen.getByTestId("clip-velocity");
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0 } as DOMRect);
    return element;
  };
  // The lane is 48 pixels high: 127 at the top, 1 at the bottom.
  const height = (velocity: number) => ((127 - velocity) / 126) * 48;
  const drag = (element: HTMLElement, beat: number, velocities: number[]) => {
    fireEvent.pointerDown(element, {
      clientX: beat * BEAT + 2,
      clientY: height(velocities[0]),
      pointerId: 2,
      button: 0,
    });
    for (const velocity of velocities.slice(1)) {
      fireEvent.pointerMove(element, { clientX: beat * BEAT + 2, clientY: height(velocity), pointerId: 2 });
    }
    fireEvent.pointerUp(element, { pointerId: 2 });
  };

  it("sets the velocity of the note under the pointer from its height, as one undo step", () => {
    setup("C4@0+1 E4@1+1");

    drag(lane(), 1, [110, 80, 60]);

    expect(notes()).toBe("C4@0+1 E4@1+1v60");
    store.getState().undo();
    expect(notes()).toBe("C4@0+1 E4@1+1");
  });

  it("sets a chord together, or moves the selected notes by as much", () => {
    const { roll } = setup("C4@0+1 E4@0+1 G4@2+1v90");

    drag(lane(), 0, [70]);
    expect(notes()).toBe("C4@0+1v70 E4@0+1v70 G4@2+1v90");

    gesture(roll, at(0.5, 60));
    gesture(roll, at(2.5, 67), undefined, 0, { shiftKey: true });
    drag(lane(), 2, [110]);
    expect(notes()).toBe("C4@0+1v90 E4@0+1v70 G4@2+1v110");
  });

  it("draws a new note as hard as the last note touched, and draws the notes fainter the softer they are", () => {
    const { roll } = setup("C4@0+1v40");

    gesture(roll, at(0.5, 60));
    gesture(roll, at(2.1, 64));

    expect(notes()).toBe("C4@0+1v40 E4@2+1v40");
    expect(document.querySelector<HTMLElement>(".clip-note")!.style.getPropertyValue("--velocity")).toBe(
      String(40 / 127),
    );
  });

  it("leaves the lane alone where no note starts", () => {
    setup("C4@0+1");

    drag(lane(), 2, [30]);

    expect(notes()).toBe("C4@0+1");
  });
});

describe("ClipEditor zoom", () => {
  const panel = () => {
    const body = document.querySelector<HTMLElement>(".clip-editor-body")!;
    vi.spyOn(body, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0 } as DOMRect);
    return body;
  };
  const beatWidth = () =>
    parseFloat(screen.getByRole("application", { name: "Piano roll" }).style.getPropertyValue("--beat"));

  it("zooms in time with Ctrl and the wheel, keeping the beat under the pointer where it is", () => {
    setup("C4@0+1");
    const body = panel();
    body.scrollLeft = 400;

    fireEvent.wheel(body, { ctrlKey: true, deltaY: -100, clientX: 200, clientY: 50 });

    const width = 40 * Math.exp(0.2);
    expect(beatWidth()).toBeCloseTo(width);
    // Beat 15 was 200 pixels in, and still is.
    expect(body.scrollLeft).toBeCloseTo(15 * width - 200);
  });

  it("makes the rows taller with Alt and the wheel, keeping the note under the pointer where it is", () => {
    setup("C4@0+1");
    const body = panel();
    body.scrollTop = 384;

    fireEvent.wheel(body, { altKey: true, deltaY: -100, clientX: 200, clientY: 100 });

    expect(body.style.getPropertyValue("--row")).toBe("20px");
    expect(body.scrollTop).toBeCloseTo(18 + ((384 + 100 - 18) / 16) * 20 - 100);
    // The rows keep their height while the page is open: back to where the other tests expect them.
    fireEvent.wheel(body, { altKey: true, deltaY: 100, clientX: 200, clientY: 100 });
    expect(body.style.getPropertyValue("--row")).toBe("16px");
  });

  it("leaves the wheel alone without Ctrl, Cmd or Alt", () => {
    setup("C4@0+1");
    const body = panel();

    const scrolled = fireEvent.wheel(body, { deltaY: -100 });

    expect(scrolled).toBe(true);
    expect(beatWidth()).toBe(40);
  });

  it("zooms with its buttons, and shows the whole clip on Fit", async () => {
    setup("C4@0+1");

    await userEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(beatWidth()).toBe(50);

    await userEvent.click(screen.getByRole("button", { name: "Fit the clip" }));
    // Without room to measure, the whole clip fits at the narrowest beat.
    expect(beatWidth()).toBe(4);
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeDisabled();
  });
});
