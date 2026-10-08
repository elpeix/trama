import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { BeatAccent } from "../../patch/meter";
import { moduleRegistry, type SequenceParamDefinition } from "../../patch/registry";
import { StepGrid } from "./StepGrid";

const definition = moduleRegistry.sequencer.params.find(
  (param): param is SequenceParamDefinition => param.kind === "sequence",
)!;
const REST = Array(13).fill("-").join(" ");

const setup = (value: string) => {
  const onChange = vi.fn();
  render(
    <StepGrid
      nodeId="sequencer-1"
      definition={definition}
      value={value}
      length={16}
      octave={0}
      scale="chromatic"
      root="C"
      onChange={onChange}
    />,
  );
  const cell = (step: number, note: string) => screen.getByRole("gridcell", { name: `Step ${step} ${note}` });
  return { onChange, cell };
};

describe("StepGrid accents", () => {
  it("marks the steps that start a beat, and more those that start a group or a bar", () => {
    const accents = Array.from({ length: 16 }, (_, step): BeatAccent | undefined =>
      step === 0 ? "bar" : step === 6 ? "group" : step % 2 === 0 ? "beat" : undefined,
    );
    render(
      <StepGrid
        nodeId="sequencer-1"
        definition={definition}
        value={Array(16).fill("-").join(" ")}
        length={16}
        octave={0}
        scale="chromatic"
        root="C"
        accents={accents}
        onChange={vi.fn()}
      />,
    );
    const mark = (step: number) => {
      const cell = screen.getByRole("gridcell", { name: `Step ${step} C4` });
      return cell.classList.contains("step-cell-group") ? "group" : cell.classList.contains("step-cell-beat") ? "beat" : "-";
    };

    expect([1, 2, 3, 5, 7, 9].map(mark)).toEqual(["group", "-", "beat", "beat", "group", "beat"]);
  });
});

describe("StepGrid with ties", () => {
  it("shows a tie as the note it holds going on, and a tie into another note as that note", () => {
    const { cell } = setup(`C4 _ _E4 ${REST}`);

    expect(cell(2, "C4")).toHaveClass("step-cell-tie");
    expect(cell(3, "E4")).toHaveAttribute("aria-pressed", "true");
    expect(cell(3, "E4")).toHaveClass("step-cell-slide");
  });

  it("glides into another note clicked on a tied step, keeping the tie", async () => {
    const { onChange, cell } = setup(`C4 _ - ${REST}`);

    await userEvent.keyboard("{Tab}");
    cell(2, "E4").focus();
    await userEvent.keyboard("{Enter}");

    expect(onChange).toHaveBeenLastCalledWith(`C4 _E4 - ${REST}`);
  });

  it("goes back to holding the note before when the note of a tied step is clicked again", async () => {
    const { onChange, cell } = setup(`C4 _E4 - ${REST}`);

    cell(2, "E4").focus();
    await userEvent.keyboard("{Enter}");

    expect(onChange).toHaveBeenLastCalledWith(`C4 _ - ${REST}`);
  });
});
