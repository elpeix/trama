import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SongControlContext, type SongControl } from "../components/song/SongControlContext";
import { SongRecorder, type RecorderEngine } from "../components/song/SongRecorder";
import { createPatchStore } from "../store/patchStore";
import { AmountControl } from "./AmountControl";

const knob = () => screen.getByRole("slider", { name: "Amount" });

/** Drags the knob up by some pixels; the whole range, from -1 to 1, takes 160. */
const drag = (pixels: number, init: { altKey?: boolean } = {}) => {
  fireEvent.pointerDown(knob(), { clientY: 200, pointerId: 1, ...init });
  fireEvent.pointerMove(knob(), { clientY: 200 - pixels, pointerId: 1, ...init });
  fireEvent.pointerUp(knob(), { pointerId: 1 });
};

beforeEach(() => {
  // jsdom has no pointer capture.
  Element.prototype.setPointerCapture ??= () => {};
});

describe("AmountControl", () => {
  it("shows the amount", () => {
    render(<AmountControl value={0.5} onChange={vi.fn()} />);

    expect(knob()).toHaveAttribute("aria-valuenow", "0.5");
    expect(knob()).toHaveAttribute("aria-valuetext", "0.50");
    expect(screen.getByText("0.50")).toBeInTheDocument();
  });

  it("allows inverting the modulation", () => {
    render(<AmountControl value={1} onChange={vi.fn()} />);

    expect(knob()).toHaveAttribute("aria-valuemin", "-1");
    expect(knob()).toHaveAttribute("aria-valuemax", "1");
  });

  it("changes when dragged up or down", () => {
    const onChange = vi.fn();
    render(<AmountControl value={0.5} onChange={onChange} />);

    drag(-40);

    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it("snaps to 0 and to 1 when dragged close to them", () => {
    const onChange = vi.fn();
    render(<AmountControl value={0.3} onChange={onChange} />);

    drag(-21);
    expect(onChange).toHaveBeenLastCalledWith(0);

    drag(54);
    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  it("does not snap while Alt is held, for fine adjustments", () => {
    const onChange = vi.fn();
    render(<AmountControl value={0.3} onChange={onChange} />);

    drag(-21, { altKey: true });

    expect(onChange).toHaveBeenLastCalledWith(0.27);
  });

  it("does not snap with the keyboard, so small steps can leave 0", async () => {
    const onChange = vi.fn();
    render(<AmountControl value={0} onChange={onChange} />);
    knob().focus();

    await userEvent.keyboard("{ArrowUp}");

    expect(onChange).toHaveBeenCalledWith(0.01);
  });

  it("types an amount after a double-click, as its own undo step", async () => {
    const onChange = vi.fn();
    render(<AmountControl value={1} onChange={onChange} />);

    await userEvent.dblClick(screen.getByText("1.00"));
    const input = screen.getByRole("textbox", { name: "Amount" });
    await userEvent.clear(input);
    await userEvent.type(input, "-0,5{Enter}");

    expect(onChange).toHaveBeenCalledExactlyOnceWith(-0.5, { merge: false });
    expect(knob()).toHaveFocus();
  });

  it("does not drag, pan or zoom the canvas", () => {
    render(<AmountControl value={1} onChange={vi.fn()} />);

    expect(knob()).toHaveClass("nodrag", "nopan", "nowheel");
  });
});

describe("AmountControl in the song", () => {
  it("records a drag with Rec into the lane of its cable, leaving the cable as it was", () => {
    const store = createPatchStore({ sync: vi.fn() });
    const lfo = store.getState().addNode("lfo", { x: 0, y: 0 });
    const gain = store.getState().addNode("gain", { x: 0, y: 0 });
    const cable = store.getState().connect({ nodeId: lfo.id, port: "out" }, { nodeId: gain.id, port: "gain" })!;
    const engine: RecorderEngine & SongControl["engine"] = {
      getSongPosition: () => 4,
      getControl: () => undefined,
      holdControl: vi.fn(),
      setControl: vi.fn(),
      releaseControl: vi.fn(),
      state: "running",
      subscribe: () => () => {},
    };
    store.getState().setSongMode(true);
    store.getState().setSongRec(true);
    const onChange = vi.fn();
    render(
      <SongControlContext value={{ engine, store, recorder: new SongRecorder(engine, store) }}>
        <AmountControl value={1} onChange={onChange} control={`${cable.id}.amount`} />
      </SongControlContext>,
    );

    drag(-40);

    expect(Object.keys(store.getState().song?.automation ?? {})).toEqual([`${cable.id}.amount`]);
    expect(onChange).not.toHaveBeenCalled();
  });
});
