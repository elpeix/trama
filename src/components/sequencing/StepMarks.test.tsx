import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StepMarks } from "./StepMarks";

const setup = (value: string, length = 16) => {
  const onChange = vi.fn();
  render(<StepMarks value={value} length={length} onChange={onChange} />);
  const row = (name: string) => screen.getByRole("group", { name });
  const step = (name: string, number: number) => within(row(name)).getByRole("button", { name: `Step ${number}` });
  return { onChange, step };
};

const REST = Array(12).fill("-").join(" ");

describe("StepMarks", () => {
  it("marks the steps that start a beat, and more those that start a group or a bar", () => {
    render(<StepMarks value={`C4 - - - ${REST}`} length={16} accents={["bar", undefined, "beat", "group"]} onChange={vi.fn()} />);
    const marks = within(screen.getByRole("group", { name: "Accents" }))
      .getAllByRole("button")
      .slice(0, 4)
      .map((step) => (step.classList.contains("step-mark-group") ? "group" : step.classList.contains("step-mark-beat") ? "beat" : "-"));

    expect(marks).toEqual(["group", "-", "beat", "group"]);
  });

  it("shows which steps are accented and which are tied", () => {
    const { step } = setup(`C4! _ D4 - ${REST}`);

    expect(step("Accents", 1)).toHaveAttribute("aria-pressed", "true");
    expect(step("Accents", 3)).toHaveAttribute("aria-pressed", "false");
    expect(step("Ties", 2)).toHaveAttribute("aria-pressed", "true");
  });

  it("accents a note, and takes the accent away", async () => {
    const first = setup(`C4 _ D4 - ${REST}`);
    await userEvent.click(first.step("Accents", 3));
    expect(first.onChange).toHaveBeenLastCalledWith(`C4 _ D4! - ${REST}`);
  });

  it("ties a step with a note to the one before, gliding into it, and unties it back to its note", async () => {
    const { onChange, step } = setup(`C4 D4 _ - ${REST}`);

    await userEvent.click(step("Ties", 2));
    expect(onChange).toHaveBeenLastCalledWith(`C4 _D4 _ - ${REST}`);
  });

  it("unties a step into its own note, or into silence when it only held the one before", async () => {
    const { onChange, step } = setup(`C4 _D4 _ - ${REST}`);

    await userEvent.click(step("Ties", 2));
    expect(onChange).toHaveBeenLastCalledWith(`C4 D4 _ - ${REST}`);

    await userEvent.click(step("Ties", 3));
    expect(onChange).toHaveBeenLastCalledWith(`C4 _D4 - - ${REST}`);
  });

  it("ties a silent step to the note before, holding it", async () => {
    const { onChange, step } = setup(`C4 - ${REST} - -`);

    await userEvent.click(step("Ties", 2));
    expect(onChange).toHaveBeenLastCalledWith(`C4 _ ${REST} - -`);
  });

  it("only accents notes, and only ties steps that follow a note", () => {
    const { step } = setup(`C4 _ - - ${REST}`);

    expect(step("Accents", 2)).toBeDisabled();
    expect(step("Accents", 3)).toBeDisabled();
    expect(step("Ties", 1)).toBeDisabled();
    expect(step("Ties", 3)).toBeEnabled();
    expect(step("Ties", 4)).toBeDisabled();
  });

  it("dims the steps beyond its length", () => {
    const { step } = setup(`C4 _ - - ${REST}`, 2);

    expect(step("Ties", 3)).toHaveClass("step-mark-off");
  });

  it("shows how often each note sounds, filled as much as its chance", () => {
    const { step } = setup(`C4?50 D4 - ${REST} -`);

    expect(step("Chances", 1)).toHaveAttribute("title", "Sounds 50% of the time; click for less, or always after 25%");
    expect(step("Chances", 1)).toHaveStyle({ "--chance": "0.5" });
    expect(step("Chances", 2)).toHaveAttribute("title", "Always sounds; click to make it sound less often");
    expect(step("Chances", 2)).toHaveStyle({ "--chance": "1" });
  });

  it("lowers the chance of a note a quarter at a time, back to always after a quarter", async () => {
    const { onChange, step } = setup(`C4 D4!?75 E4?50 F4?25 ${REST}`);

    await userEvent.click(step("Chances", 1));
    expect(onChange).toHaveBeenLastCalledWith(`C4?75 D4!?75 E4?50 F4?25 ${REST}`);

    await userEvent.click(step("Chances", 2));
    expect(onChange).toHaveBeenLastCalledWith(`C4 D4!?50 E4?50 F4?25 ${REST}`);

    await userEvent.click(step("Chances", 3));
    expect(onChange).toHaveBeenLastCalledWith(`C4 D4!?75 E4?25 F4?25 ${REST}`);

    await userEvent.click(step("Chances", 4));
    expect(onChange).toHaveBeenLastCalledWith(`C4 D4!?75 E4?50 F4 ${REST}`);
  });

  it("gives a chance only to the notes that start, not to rests nor ties", () => {
    const { step } = setup(`C4 _ _E4 - ${REST}`);

    expect(step("Chances", 1)).toBeEnabled();
    expect(step("Chances", 2)).toBeDisabled();
    expect(step("Chances", 3)).toBeDisabled();
    expect(step("Chances", 4)).toBeDisabled();
  });

  it("drops the chance of a note tied to the one before", async () => {
    const { onChange, step } = setup(`C4 D4?50 - - ${REST}`);

    await userEvent.click(step("Ties", 2));

    expect(onChange).toHaveBeenLastCalledWith(`C4 _D4 - - ${REST}`);
  });
});
