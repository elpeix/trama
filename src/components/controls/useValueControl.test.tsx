import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ValueRange } from "./scale";
import { useValueControl } from "./useValueControl";

const FREQ: ValueRange = { min: 20, max: 20000, step: 1, scale: "log" };
const Q: ValueRange = { min: 0.1, max: 20, step: 0.1, scale: "log" };
const GAIN: ValueRange = { min: 0, max: 1, step: 0.01, scale: "linear" };

function Control({
  initial,
  range,
  onGrab,
  onRelease,
}: {
  initial: number;
  range: ValueRange;
  onGrab?: () => void;
  onRelease?: () => void;
}) {
  const [value, setValue] = useState(initial);
  const { draft, setDraft, displayProps, inputProps } = useValueControl({ value, range, onChange: setValue, onGrab, onRelease });
  return draft === null ? (
    <div {...displayProps} aria-label="Value">
      {value}
    </div>
  ) : (
    <input {...inputProps} aria-label="Value" onChange={(event) => setDraft(event.target.value)} />
  );
}

const display = () => screen.getByRole("spinbutton", { name: "Value" });
const current = () => Number(display().getAttribute("aria-valuenow"));

beforeEach(() => {
  // jsdom has no pointer capture.
  Element.prototype.setPointerCapture ??= () => {};
});

describe("useValueControl", () => {
  it("moves a log value as much at the bottom of its range as at the top", async () => {
    render(<Control initial={100} range={FREQ} />);
    display().focus();

    await userEvent.keyboard("{Shift>}{ArrowUp}{/Shift}");
    // Ten of 200 increments across three decades: 100 × 1000^(10/200).
    expect(current()).toBe(141);
  });

  it("always moves at least one step", async () => {
    render(<Control initial={0.1} range={Q} />);
    display().focus();

    await userEvent.keyboard("{ArrowUp}");

    expect(current()).toBe(0.2);
  });

  it("drags a linear value by its step", () => {
    render(<Control initial={0.5} range={GAIN} />);

    fireEvent.pointerDown(display(), { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(display(), { clientY: 70, pointerId: 1 });

    expect(current()).toBe(0.6);
  });

  it("tells when a drag grabs the value and when it lets go", () => {
    const onGrab = vi.fn();
    const onRelease = vi.fn();
    render(<Control initial={0.5} range={GAIN} onGrab={onGrab} onRelease={onRelease} />);

    fireEvent.pointerDown(display(), { clientY: 100, pointerId: 1 });
    expect(onGrab).toHaveBeenCalledTimes(1);
    expect(onRelease).not.toHaveBeenCalled();

    fireEvent.pointerUp(display(), { pointerId: 1 });
    expect(onRelease).toHaveBeenCalledTimes(1);

    fireEvent.pointerDown(display(), { clientY: 100, pointerId: 1 });
    fireEvent.pointerCancel(display(), { pointerId: 1 });
    expect(onRelease).toHaveBeenCalledTimes(2);
  });

  it("goes on from where it was when Alt is pressed halfway through a drag", () => {
    render(<Control initial={0.5} range={GAIN} />);

    fireEvent.pointerDown(display(), { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(display(), { clientY: 70, pointerId: 1 });
    expect(current()).toBe(0.6);

    // Ten times finer from here: 30 more pixels are one step, not ten.
    fireEvent.pointerMove(display(), { clientY: 70, pointerId: 1, altKey: true });
    fireEvent.pointerMove(display(), { clientY: 40, pointerId: 1, altKey: true });
    expect(current()).toBe(0.61);
  });

  it("keeps a typed value inside the range and on its step", async () => {
    render(<Control initial={0.5} range={GAIN} />);

    await userEvent.dblClick(display());
    await userEvent.clear(screen.getByRole("textbox", { name: "Value" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Value" }), "0.337{Enter}");
    expect(current()).toBe(0.34);

    await userEvent.dblClick(display());
    await userEvent.clear(screen.getByRole("textbox", { name: "Value" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Value" }), "7{Enter}");
    expect(current()).toBe(1);
  });

  it("opens typing with Enter and ignores what is not a number", async () => {
    render(<Control initial={0.5} range={GAIN} />);
    display().focus();

    await userEvent.keyboard("{Enter}");
    await userEvent.clear(screen.getByRole("textbox", { name: "Value" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Value" }), "loud{Enter}");

    expect(current()).toBe(0.5);
    expect(display()).toHaveTextContent("0.5");
  });
});
