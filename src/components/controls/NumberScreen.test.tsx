import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NumberScreen } from "./NumberScreen";

beforeEach(() => {
  Element.prototype.setPointerCapture ??= () => {};
});

const display = () => screen.getByRole("spinbutton", { name: "Bars" });

describe("NumberScreen", () => {
  it("shows a whole number on a small screen, with its range", () => {
    render(<NumberScreen label="Bars" value={8} min={1} max={99} onChange={vi.fn()} />);

    expect(display()).toHaveTextContent("8");
    expect(display()).toHaveAttribute("aria-valuenow", "8");
    expect(display()).toHaveAttribute("aria-valuemin", "1");
    expect(display()).toHaveAttribute("aria-valuemax", "99");
  });

  it("changes a step at a time with the arrow keys, within its range", async () => {
    const onChange = vi.fn();
    render(<NumberScreen label="Bars" value={99} min={1} max={99} onChange={onChange} />);

    display().focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(onChange).toHaveBeenLastCalledWith(98);

    onChange.mockClear();
    await userEvent.keyboard("{ArrowUp}");
    expect(onChange).not.toHaveBeenCalledWith(100);
  });

  it("can be typed after a double-click, kept within its range", async () => {
    const onChange = vi.fn();
    render(<NumberScreen label="Bars" value={8} min={1} max={99} onChange={onChange} />);

    await userEvent.dblClick(display());
    const input = screen.getByRole("textbox", { name: "Bars" });
    await userEvent.clear(input);
    await userEvent.type(input, "120{Enter}");

    expect(onChange).toHaveBeenLastCalledWith(99);
  });

  it("shows the value its own way, while it keeps the number", () => {
    render(<NumberScreen label="Fade" value={0} min={0} max={8} onChange={vi.fn()} format={(value) => (value === 0 ? "off" : String(value))} />);

    expect(screen.getByRole("spinbutton", { name: "Fade" })).toHaveTextContent("off");
  });
});
