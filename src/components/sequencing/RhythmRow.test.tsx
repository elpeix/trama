import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { RhythmParamDefinition } from "../../patch/registry";
import { RhythmRow } from "./RhythmRow";

const definition = (chance?: boolean, retrig?: boolean): RhythmParamDefinition => ({
  id: "hat",
  label: "Hat",
  kind: "rhythm",
  steps: 4,
  length: "length",
  default: "- - - -",
  ...(chance && { chance }),
  ...(retrig && { retrig }),
});

const setup = (value: string, chance = true, retrig = false) => {
  const onChange = vi.fn();
  render(<RhythmRow nodeId="drums-1" definition={definition(chance, retrig)} value={value} length={4} onChange={onChange} />);
  const step = (number: number) =>
    within(screen.getByRole("group", { name: "Hat" })).getByRole("button", { name: `Step ${number}` });
  return { onChange, step };
};

/** A click with Shift held, the pointer going down on the step first, as where nothing keeps it. */
const shiftClick = (element: HTMLElement) => {
  fireEvent.pointerDown(element, { button: 0, buttons: 1, shiftKey: true });
  fireEvent.click(element, { detail: 1, shiftKey: true });
};

describe("RhythmRow", () => {
  it("marks the steps that start a beat, and more those that start a group or a bar", () => {
    render(
      <RhythmRow
        nodeId="drums-1"
        definition={definition()}
        value="- - - -"
        length={4}
        accents={["bar", undefined, "beat", "group"]}
        onChange={vi.fn()}
      />,
    );
    const steps = within(screen.getByRole("group", { name: "Hat" })).getAllByRole("button");

    expect(steps.map((step) => (step.classList.contains("rhythm-step-group") ? "group" : step.classList.contains("rhythm-step-beat") ? "beat" : "-"))).toEqual([
      "group",
      "-",
      "beat",
      "group",
    ]);
  });

  it("switches a step on and off, keeping the chance of the others", async () => {
    const { onChange, step } = setup("x?50 - x -");

    await userEvent.click(step(2));

    expect(onChange.mock.lastCall?.[0]).toBe("x?50 x x -");
  });

  it("shows how often each step sounds, filled as much as its chance", () => {
    const { step } = setup("x?25 x - -");

    expect(step(1)).toHaveAttribute("title", "Sounds 25% of the time; right-click for less, or always after 25%");
    expect(step(1)).toHaveStyle({ "--chance": "0.25" });
    expect(step(2)).toHaveAttribute("title", "Always sounds; right-click to make it sound less often");
    expect(step(3)).not.toHaveAttribute("title");
  });

  it("lowers the chance of a step that sounds on a right click, a quarter at a time", () => {
    const { onChange, step } = setup("x x?75 x?50 x?25");

    const menus = [1, 2, 3, 4].map((number) => fireEvent.contextMenu(step(number)));

    expect(menus).toEqual([false, false, false, false]);
    expect(onChange.mock.calls.map(([value]) => value)).toEqual([
      "x?75 x?75 x?50 x?25",
      "x x?50 x?50 x?25",
      "x x?75 x?25 x?25",
      "x x?75 x?50 x",
    ]);
  });

  it("shows the retrigs of a step, and keeps them when its chance is lowered", () => {
    const { onChange, step } = setup("x3 x?50 - -");

    expect(step(1)).toHaveAttribute("data-retrig", "3");
    expect(step(1)).toHaveAttribute("title", "Always sounds, 3 times within the step; right-click to make it sound less often");
    expect(step(2)).not.toHaveAttribute("data-retrig");

    fireEvent.contextMenu(step(1));

    expect(onChange.mock.lastCall?.[0]).toBe("x3?75 x?50 - -");
  });

  it("goes through 2, 3 and 4 retrigs of a step that sounds on a Shift-click, and back to once", () => {
    const { onChange, step } = setup("x x2 x3?50 x4", true, true);

    [1, 2, 3, 4].forEach((number) => shiftClick(step(number)));

    expect(onChange.mock.calls.map(([value]) => value)).toEqual([
      "x2 x2 x3?50 x4",
      "x x3 x3?50 x4",
      "x x2 x4?50 x4",
      "x x2 x3?50 x",
    ]);
  });

  it("goes through the retrigs with Shift and Enter too", () => {
    const { onChange, step } = setup("x - - -", true, true);

    fireEvent.click(step(1), { detail: 0, shiftKey: true });

    expect(onChange).toHaveBeenLastCalledWith("x2 - - -");
  });

  it("switches a silent step on as usual on a Shift-click", () => {
    const { onChange, step } = setup("x - - -", true, true);

    shiftClick(step(2));

    expect(onChange).toHaveBeenCalledExactlyOnceWith("x x - -");
  });

  it("takes a Shift-click from the click alone, as the canvas keeps the pointer down to itself while Shift selects", () => {
    const { onChange, step } = setup("x - - -", true, true);

    fireEvent.click(step(1), { detail: 1, shiftKey: true });

    expect(onChange).toHaveBeenCalledExactlyOnceWith("x2 - - -");
  });

  it("splits a step in a part for each time it sounds, and tells the Shift-click", () => {
    const { step } = setup("x3 x - -", true, true);
    const parts = (element: HTMLElement) => element.querySelectorAll(".rhythm-retrig-part").length;

    expect(parts(step(1))).toBe(3);
    expect(parts(step(2))).toBe(0);
    expect(step(2)).toHaveAttribute("title", "Always sounds; right-click to make it sound less often, Shift-click to play it 2 to 4 times within the step");
  });

  it("gives no retrigs in a row that has none, like the rhythm of the Arp", () => {
    const { onChange, step } = setup("x - - -", false);

    shiftClick(step(1));

    expect(onChange).toHaveBeenCalledExactlyOnceWith("- - - -");
  });

  it("keeps a step as it is when the right button goes down on it", () => {
    const { onChange, step } = setup("x - x -");

    fireEvent.pointerDown(step(1), { button: 2, buttons: 2 });
    fireEvent.pointerEnter(step(2), { buttons: 2 });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("leaves a silent step alone on a right click", () => {
    const { onChange, step } = setup("- x - -");

    fireEvent.contextMenu(step(1));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("gives no chances in a row that has none, like the rhythm of the Arp", () => {
    const { onChange, step } = setup("x - x -", false);

    const menu = fireEvent.contextMenu(step(1));

    expect(menu).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
    expect(step(1)).not.toHaveAttribute("title");
  });
});
