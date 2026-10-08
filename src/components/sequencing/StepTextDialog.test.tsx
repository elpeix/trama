import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { readNotesText, readRhythmText, readSequenceText } from "../../patch/stepText";
import { StepTextButton, StepTextDialog, type StepTextRow } from "./StepTextDialog";

const drums = { steps: 4, chance: true, retrig: true };
const rows = (kick: string, hat: string): StepTextRow[] => [
  { id: "kick", label: "Kick", value: kick, read: (text) => readRhythmText(text, drums) },
  { id: "hat", label: "Hat", value: hat, read: (text) => readRhythmText(text, drums) },
];

const setup = (dialogRows: StepTextRow[]) => {
  const onApply = vi.fn();
  const onClose = vi.fn();
  render(<StepTextDialog title="Drums · A1" rows={dialogRows} onApply={onApply} onClose={onClose} />);
  return { onApply, onClose };
};

const field = (name: string) => screen.getByRole("textbox", { name }) as HTMLInputElement;
const apply = () => screen.getByRole("button", { name: "Apply" });

describe("StepTextDialog", () => {
  it("shows each row as text, with its steps lined up, and the first one ready to type in", () => {
    setup(rows("x?50 - x3 x", "x - x x?25"));
    expect(screen.getByRole("dialog", { name: "Drums · A1" })).toBeInTheDocument();
    expect(field("Kick").value).toBe("x?50 - x3 x");
    expect(field("Hat").value).toBe("x    - x  x?25");
    expect(field("Kick")).toHaveFocus();
  });

  it("leaves out of the columns a row that is not steps", () => {
    setup([
      { id: "rhythm", label: "Rhythm", value: "x?50 - x", read: (text) => readRhythmText(text, drums) },
      { id: "notes", label: "Notes", value: "C4 E4 G4", read: (text) => readNotesText(text, { lowest: 60, highest: 72 }), steps: false },
    ]);
    expect(field("Rhythm").value).toBe("x?50 - x");
    expect(field("Notes").value).toBe("C4 E4 G4");
  });

  it("applies the rows changed, as they are stored, all at once, and closes", async () => {
    const { onApply, onClose } = setup(rows("x - - -", "- - x -"));
    await userEvent.clear(field("Kick"));
    await userEvent.type(field("Kick"), "X - X");
    await userEvent.click(apply());
    expect(onApply).toHaveBeenCalledExactlyOnceWith({ kick: "x - x -" });
    expect(onClose).toHaveBeenCalled();
  });

  it("applies with Enter", async () => {
    const { onApply } = setup(rows("x - - -", "- - x -"));
    await userEvent.clear(field("Hat"));
    await userEvent.type(field("Hat"), "- - x x{Enter}");
    expect(onApply).toHaveBeenCalledExactlyOnceWith({ hat: "- - x x" });
  });

  it("applies nothing when nothing changed but the spacing", async () => {
    const { onApply, onClose } = setup(rows("x - - -", "- - x -"));
    await userEvent.type(field("Kick"), "   ");
    await userEvent.click(apply());
    expect(onApply).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("says what is wrong while typing, and applies nothing until it is right", async () => {
    const { onApply } = setup(rows("x - - -", "- - x -"));
    await userEvent.clear(field("Hat"));
    await userEvent.type(field("Hat"), "- - o");
    expect(field("Hat")).toHaveAttribute("aria-invalid", "true");
    expect(field("Hat")).toHaveAccessibleDescription(
      '"o" is not a step: x for one that sounds, - for one that does not',
    );
    expect(field("Kick")).toHaveAttribute("aria-invalid", "false");
    expect(apply()).toBeDisabled();
    await userEvent.type(field("Hat"), "{Enter}");
    expect(onApply).not.toHaveBeenCalled();
  });

  it("selects the step that is wrong on Enter", async () => {
    setup(rows("x - - -", "- - x -"));
    await userEvent.clear(field("Hat"));
    await userEvent.type(field("Hat"), "- - o x{Enter}");
    expect([field("Hat").selectionStart, field("Hat").selectionEnd]).toEqual([4, 5]);
  });

  it("closes without applying on Cancel or Escape, but not on a click around it", async () => {
    const { onApply, onClose } = setup(rows("x - - -", "- - x -"));
    await userEvent.type(field("Kick"), " x");
    fireEvent.pointerDown(document.querySelector(".modal-backdrop")!);
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onApply).not.toHaveBeenCalled();
  });

  it("moves to the row above or below with the arrows, keeping the cursor at its column", () => {
    setup([...rows("x - - -", "- - x -"), { id: "acc", label: "Acc", value: "x", read: (text) => readRhythmText(text, drums) }]);
    field("Kick").setSelectionRange(4, 4);

    fireEvent.keyDown(field("Kick"), { key: "ArrowDown" });
    expect(field("Hat")).toHaveFocus();
    expect([field("Hat").selectionStart, field("Hat").selectionEnd]).toEqual([4, 4]);

    fireEvent.keyDown(field("Hat"), { key: "ArrowDown" });
    expect(field("Acc")).toHaveFocus();
    expect([field("Acc").selectionStart, field("Acc").selectionEnd]).toEqual([1, 1]);

    fireEvent.keyDown(field("Acc"), { key: "ArrowUp" });
    expect(field("Hat")).toHaveFocus();
    expect(field("Hat").selectionStart).toBe(1);
  });

  it("leaves the arrows to the field on the first and the last row", () => {
    setup(rows("x - - -", "- - x -"));
    field("Kick").setSelectionRange(2, 2);

    expect(fireEvent.keyDown(field("Kick"), { key: "ArrowUp" })).toBe(true);
    expect(field("Kick")).toHaveFocus();
    field("Hat").focus();
    expect(fireEvent.keyDown(field("Hat"), { key: "ArrowDown" })).toBe(true);
    expect(field("Hat")).toHaveFocus();
  });

  it("reads the steps of a Seq, its notes in any case", async () => {
    const seq = { steps: 4, lowest: 60, highest: 95 };
    const { onApply } = setup([{ id: "steps", label: "Steps", value: "C4 - - -", read: (text) => readSequenceText(text, seq) }]);
    await userEvent.clear(field("Steps"));
    await userEvent.type(field("Steps"), "c4 eb4! _ g4?50{Enter}");
    expect(onApply).toHaveBeenCalledExactlyOnceWith({ steps: "C4 D#4! _ G4?50" });
  });
});

describe("StepTextButton", () => {
  it("is a pencil that says what it does, and opens the steps as text", async () => {
    render(<StepTextButton title="Drums · A1" rows={rows("x - - -", "- - x -")} onApply={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Edit as text" });
    expect(button.querySelector("svg")).toBeInTheDocument();

    act(() => button.focus());
    expect(screen.getByRole("tooltip")).toHaveTextContent("Write them as text, or paste them");
    await userEvent.click(button);

    expect(screen.getByRole("dialog", { name: "Drums · A1" })).toBeInTheDocument();
  });
});
