import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { moduleRegistry, type NumberParamDefinition } from "../../patch/registry";
import { ParamControl } from "./ParamControl";

const [waveform, , frequency] = moduleRegistry.oscillator.params;

describe("ParamControl", () => {
  it("shows a number param with its unit", () => {
    render(<ParamControl definition={frequency} value={440} onChange={vi.fn()} />);

    expect(screen.getByRole("slider", { name: "Freq" })).toBeInTheDocument();
    expect(screen.getByText("440 Hz")).toBeInTheDocument();
  });

  describe("knob", () => {
    beforeEach(() => {
      // jsdom has no pointer capture.
      Element.prototype.setPointerCapture ??= () => {};
    });

    const knob = (name = "Freq") => screen.getByRole("slider", { name });
    const dragKnob = (pixels: number, init: { altKey?: boolean } = {}, name?: string) => {
      fireEvent.pointerDown(knob(name), { clientY: 200, pointerId: 1, ...init });
      fireEvent.pointerMove(knob(name), { clientY: 200 - pixels, pointerId: 1, ...init });
      fireEvent.pointerUp(knob(name), { pointerId: 1 });
    };

    it("turns on the param scale when dragged up or down", () => {
      const onChange = vi.fn();
      render(<ParamControl definition={frequency} value={440} onChange={onChange} />);

      // The whole range takes 160 pixels: a quarter of it, on a log scale, multiplies by 1000^¼.
      dragKnob(40);

      expect(onChange).toHaveBeenLastCalledWith(2474);
      expect(knob()).toHaveAttribute("aria-valuetext", "440 Hz");
    });

    it("turns ten times finer with Alt", () => {
      const onChange = vi.fn();
      render(<ParamControl definition={frequency} value={440} onChange={onChange} />);

      dragKnob(40, { altKey: true });

      expect(onChange).toHaveBeenLastCalledWith(523);
    });

    it("snaps to the default while dragging, but not with Alt", () => {
      const onChange = vi.fn();
      render(<ParamControl definition={frequency} value={400} onChange={onChange} />);

      dragKnob(2);
      expect(onChange).toHaveBeenLastCalledWith(440);

      dragKnob(2, { altKey: true });
      expect(onChange).toHaveBeenLastCalledWith(403);
    });

    it("snaps to 0 when the range goes below it", () => {
      const onChange = vi.fn();
      const octave = moduleRegistry.sequencer.params.find(({ id }) => id === "octave") as NumberParamDefinition;
      render(<ParamControl definition={{ ...octave, default: 2 }} value={-1} onChange={onChange} />);

      // One octave takes 160 / 6 pixels: 25 pixels is almost one, and close enough to snap.
      dragKnob(25, {}, "Octave");

      expect(onChange).toHaveBeenLastCalledWith(0);
    });

    it("changes with the arrow keys", async () => {
      const onChange = vi.fn();
      render(<ParamControl definition={moduleRegistry.gain.params[0]} value={0.5} onChange={onChange} />);
      screen.getByRole("slider", { name: "Gain" }).focus();

      await userEvent.keyboard("{ArrowUp}");

      expect(onChange).toHaveBeenCalledWith(0.51);
    });

    it("goes back to its default when its name is double-clicked, as its own undo step", async () => {
      const onChange = vi.fn();
      render(<ParamControl definition={frequency} value={1000} onChange={onChange} />);

      await userEvent.dblClick(screen.getByText("Freq"));

      expect(onChange).toHaveBeenCalledExactlyOnceWith(440, { merge: false });
    });
  });

  it("shows a select param with its options", () => {
    render(<ParamControl definition={waveform} value="sine" onChange={vi.fn()} />);

    const select = screen.getByRole("combobox", { name: "Wave" });
    expect(select).toHaveValue("sine");
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "sine",
      "square",
      "sawtooth",
      "triangle",
      "drawn",
      "harmonics",
    ]);
  });

  it("reports select changes", () => {
    const onChange = vi.fn();
    render(<ParamControl definition={waveform} value="sine" onChange={onChange} />);

    fireEvent.change(screen.getByRole("combobox", { name: "Wave" }), {
      target: { value: "square" },
    });

    expect(onChange).toHaveBeenCalledWith("square");
  });

  it("keeps controls from dragging the node, panning or zooming the editor", () => {
    render(<ParamControl definition={frequency} value={440} onChange={vi.fn()} />);

    expect(screen.getByRole("slider", { name: "Freq" })).toHaveClass("nodrag", "nopan", "nowheel");
  });

  it("can be locked to another value", () => {
    render(
      <ParamControl
        definition={frequency}
        value={440}
        onChange={vi.fn()}
        locked={{ value: 20000, label: "max" }}
      />,
    );

    const knob = screen.getByRole("slider", { name: "Freq" });
    expect(knob).toHaveAttribute("aria-disabled", "true");
    expect(knob).toHaveAttribute("aria-valuenow", "20000");
    expect(knob).not.toHaveAttribute("tabindex");
    expect(screen.getByText("max")).toBeInTheDocument();
    expect(screen.queryByText("440 Hz")).toBeNull();
  });

  describe("typing a value", () => {
    const typeValue = async (text: string) => {
      const input = screen.getByRole("textbox", { name: "Freq" });
      await userEvent.clear(input);
      await userEvent.type(input, text);
    };

    it("types a value after a double-click, as its own undo step", async () => {
      const onChange = vi.fn();
      render(<ParamControl definition={frequency} value={440} onChange={onChange} />);

      await userEvent.dblClick(screen.getByText("440 Hz"));
      expect(screen.getByRole("textbox", { name: "Freq" })).toHaveValue("440");
      await typeValue("880 Hz{Enter}");

      expect(onChange).toHaveBeenCalledExactlyOnceWith(880, { merge: false });
      expect(screen.queryByRole("textbox", { name: "Freq" })).toBeNull();
      expect(screen.getByRole("slider", { name: "Freq" })).toHaveFocus();
    });

    it("keeps the value inside the range and on its step", async () => {
      const onChange = vi.fn();
      render(<ParamControl definition={frequency} value={440} onChange={onChange} />);

      await userEvent.dblClick(screen.getByText("440 Hz"));
      await typeValue("30000{Enter}");
      await userEvent.dblClick(screen.getByText("440 Hz"));
      await typeValue("123.4{Enter}");

      expect(onChange.mock.calls).toEqual([
        [20000, { merge: false }],
        [123, { merge: false }],
      ]);
    });

    it("opens with Enter on the slider", async () => {
      render(<ParamControl definition={frequency} value={440} onChange={vi.fn()} />);
      screen.getByRole("slider", { name: "Freq" }).focus();

      await userEvent.keyboard("{Enter}");

      expect(screen.getByRole("textbox", { name: "Freq" })).toHaveFocus();
    });

    it("keeps the value on Escape, or when it is not a number", async () => {
      const onChange = vi.fn();
      render(<ParamControl definition={frequency} value={440} onChange={onChange} />);

      await userEvent.dblClick(screen.getByText("440 Hz"));
      await typeValue("880{Escape}");
      await userEvent.dblClick(screen.getByText("440 Hz"));
      await typeValue("loud{Enter}");

      expect(onChange).not.toHaveBeenCalled();
      expect(screen.getByRole("slider", { name: "Freq" })).toHaveFocus();
    });

    it("saves when the field loses focus", async () => {
      const onChange = vi.fn();
      render(<ParamControl definition={frequency} value={440} onChange={onChange} />);

      await userEvent.dblClick(screen.getByText("440 Hz"));
      await typeValue("660");
      await userEvent.click(document.body);

      expect(onChange).toHaveBeenCalledExactlyOnceWith(660, { merge: false });
    });

    it("cannot be typed while locked", async () => {
      render(
        <ParamControl
          definition={frequency}
          value={440}
          onChange={vi.fn()}
          locked={{ value: 20000, label: "max" }}
        />,
      );

      await userEvent.dblClick(screen.getByText("max"));

      expect(screen.queryByRole("textbox", { name: "Freq" })).toBeNull();
    });
  });

  describe("modulation", () => {
    const nextFrame = () =>
      act(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const mark = () => document.querySelector<SVGPathElement>(".knob-modulation")!;

    it("draws how far the modulation takes the value, on every frame", async () => {
      let added: number | undefined = 1200;
      render(<ParamControl definition={frequency} value={440} onChange={vi.fn()} modulation={() => added} />);

      await nextFrame();
      expect(mark()).toBeVisible();
      const octaveUp = mark().getAttribute("d");

      added = -1200;
      await nextFrame();
      expect(mark().getAttribute("d")).not.toBe(octaveUp);

      added = undefined;
      await nextFrame();
      expect(mark()).not.toBeVisible();
    });

    it("draws nothing without modulation", () => {
      render(<ParamControl definition={frequency} value={440} onChange={vi.fn()} />);

      expect(mark()).toBeNull();
    });
  });
  it("shows what a param belongs to over its name, and names its knob with both", () => {
    render(<ParamControl definition={frequency} value={440} onChange={vi.fn()} context="Lead › Oscillator" />);

    expect(screen.getByText("Lead › Oscillator")).toHaveClass("param-context");
    expect(screen.getByText("Freq")).toHaveClass("param-name");
    expect(screen.getByRole("slider", { name: "Lead › Oscillator › Freq" })).toBeInTheDocument();
  });

  it("renames a param from the whole of its name", () => {
    const onRename = vi.fn();
    render(<ParamControl definition={frequency} value={440} onChange={vi.fn()} context="Lead" onRename={onRename} />);

    fireEvent.doubleClick(screen.getByText("Freq"));
    const field = screen.getByRole("textbox", { name: "Name of Lead › Freq" });
    expect(field).toHaveValue("Lead › Freq");
    fireEvent.keyDown(field, { key: "Enter" });

    expect(onRename).toHaveBeenCalledWith("Lead › Freq");
  });

  describe("pin to perform", () => {
    const param = () => screen.getByRole("slider", { name: "Freq" }).closest(".param")!;

    it("offers to pin a knob with a right click on it, and toggles the pin from the menu", () => {
      const onToggle = vi.fn();
      render(<ParamControl definition={frequency} value={440} onChange={vi.fn()} pin={{ pinned: false, onToggle }} />);

      fireEvent.contextMenu(screen.getByRole("slider", { name: "Freq" }));
      fireEvent.click(screen.getByRole("menuitem", { name: "Pin to Perform" }));

      expect(onToggle).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("menu")).toBeNull();
    });

    it("offers to unpin a pinned knob, marked on its param, from a right click on its name too", () => {
      render(<ParamControl definition={frequency} value={440} onChange={vi.fn()} pin={{ pinned: true, onToggle: vi.fn() }} />);

      expect(param()).toHaveClass("param-pinned");
      fireEvent.contextMenu(screen.getByText("Freq"));

      expect(screen.getByRole("menuitem", { name: "Unpin from Perform" })).toHaveFocus();
    });

    it("closes the menu with Escape or a click elsewhere", () => {
      render(<ParamControl definition={frequency} value={440} onChange={vi.fn()} pin={{ pinned: false, onToggle: vi.fn() }} />);

      fireEvent.contextMenu(param());
      fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
      expect(screen.queryByRole("menu")).toBeNull();

      fireEvent.contextMenu(param());
      fireEvent.pointerDown(document.body);
      expect(screen.queryByRole("menu")).toBeNull();
    });

    it("leaves the right click alone without a pin", () => {
      render(<ParamControl definition={frequency} value={440} onChange={vi.fn()} />);

      expect(fireEvent.contextMenu(param())).toBe(true);
      expect(screen.queryByRole("menu")).toBeNull();
      expect(param()).not.toHaveClass("param-pinned");
    });
  });
});
