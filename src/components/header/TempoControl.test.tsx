import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPatchStore } from "../../store/patchStore";
import { PatchStoreContext } from "../../store/usePatchStore";
import { displayEngine } from "../../test/displayEngine";
import { EngineContext } from "../EngineContext";
import { TempoControl } from "./TempoControl";

let store: ReturnType<typeof createPatchStore>;
let beat: number | undefined;
let clock: number;

beforeEach(() => {
  // jsdom has no pointer capture.
  Element.prototype.setPointerCapture ??= () => {};
  beat = undefined;
  clock = 0;
  store = createPatchStore({ sync: vi.fn() }, { now: () => clock });
  render(
    <PatchStoreContext value={store}>
      <EngineContext value={displayEngine({ getBeat: () => beat })}>
        <TempoControl />
      </EngineContext>
    </PatchStoreContext>,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

const display = () => screen.getByRole("spinbutton", { name: "Tempo" });
const tempo = () => store.getState().tempo;

describe("TempoControl", () => {
  it("shows the tempo of the patch", () => {
    expect(display()).toHaveTextContent("120");
    expect(display()).toHaveAttribute("aria-valuenow", "120");
    expect(display()).toHaveAttribute("aria-valuetext", "120 BPM");
  });

  it("changes with the arrow keys, by ten with Shift or the page keys", async () => {
    display().focus();

    await userEvent.keyboard("{ArrowUp}{ArrowUp}");
    expect(tempo()).toBe(122);
    await userEvent.keyboard("{Shift>}{ArrowDown}{/Shift}");
    expect(tempo()).toBe(112);
    await userEvent.keyboard("{PageUp}");
    expect(tempo()).toBe(122);
    await userEvent.keyboard("{End}");
    expect(tempo()).toBe(300);
    await userEvent.keyboard("{Home}");
    expect(tempo()).toBe(30);
  });

  it("changes by dragging up or down", () => {
    fireEvent.pointerDown(display(), { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(display(), { clientY: 70, pointerId: 1 });
    expect(tempo()).toBe(130);

    fireEvent.pointerMove(display(), { clientY: 115, pointerId: 1 });
    expect(tempo()).toBe(115);

    fireEvent.pointerUp(display(), { pointerId: 1 });
    fireEvent.pointerMove(display(), { clientY: 0, pointerId: 1 });
    expect(tempo()).toBe(115);
  });

  it("makes a whole drag one undo step", () => {
    fireEvent.pointerDown(display(), { clientY: 100, pointerId: 1 });
    for (let y = 97; y >= 40; y -= 3) {
      clock += 16;
      fireEvent.pointerMove(display(), { clientY: y, pointerId: 1 });
    }
    fireEvent.pointerUp(display(), { pointerId: 1 });
    store.getState().undo();

    expect(tempo()).toBe(120);
  });

  it("changes with the mouse wheel", () => {
    fireEvent.wheel(display(), { deltaY: -100 });
    fireEvent.wheel(display(), { deltaY: -100 });
    fireEvent.wheel(display(), { deltaY: 100 });

    expect(tempo()).toBe(121);
  });

  it("can be typed after a double-click", async () => {
    await userEvent.dblClick(display());
    const input = screen.getByRole("textbox", { name: "Tempo" });

    await userEvent.clear(input);
    await userEvent.type(input, "9a6{Enter}");

    expect(tempo()).toBe(96);
    expect(display()).toHaveTextContent("96");
  });

  it("keeps the tempo when typing is cancelled", async () => {
    await userEvent.dblClick(display());

    await userEvent.type(screen.getByRole("textbox", { name: "Tempo" }), "{Backspace}{Backspace}{Backspace}5{Escape}");

    expect(tempo()).toBe(120);
    expect(display()).toHaveTextContent("120");
  });

  it("joins the display and Tap in one block", () => {
    const block = screen.getByRole("button", { name: "Tap" }).parentElement!;

    expect(block).toHaveClass("hw-group");
    expect(block).toContainElement(display());
  });

  it("sets the tempo from taps", async () => {
    let now = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const tapButton = screen.getByRole("button", { name: "Tap" });

    for (let tap = 0; tap < 4; tap++) {
      await userEvent.click(tapButton);
      now += 400;
    }

    expect(tempo()).toBe(150);
  });

  it("flashes on the beat while the sound runs, differently on the first beat of a bar", async () => {
    const light = document.querySelector(".tempo-light")!;

    beat = 4.05;
    await act(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    expect(light).toHaveAttribute("data-beat", "bar");

    beat = 5.05;
    await act(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    expect(light).toHaveAttribute("data-beat", "beat");

    beat = 5.5;
    await act(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    expect(light).toHaveAttribute("data-beat", "off");

    beat = undefined;
    await act(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    expect(light).toHaveAttribute("data-beat", "off");
  });

  it("flashes the first beat of each group of the meter differently too", async () => {
    act(() => store.getState().setMeter([3, 2]));
    const light = document.querySelector(".tempo-light")!;
    const lightAt = async (at: number) => {
      beat = at;
      await act(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      return light.getAttribute("data-beat");
    };

    expect(await lightAt(0.05)).toBe("bar");
    expect(await lightAt(2.05)).toBe("beat");
    expect(await lightAt(3.05)).toBe("group");
    expect(await lightAt(4.05)).toBe("beat");
    expect(await lightAt(5.05)).toBe("bar");
  });

  it("flashes on each dotted quarter in a meter of eighths", async () => {
    act(() => store.getState().setMeter({ eighths: [3, 3] }));
    const light = document.querySelector(".tempo-light")!;
    const lightAt = async (at: number) => {
      beat = at;
      await act(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      return light.getAttribute("data-beat");
    };

    expect(await lightAt(0.05)).toBe("bar");
    expect(await lightAt(1.05)).toBe("off");
    expect(await lightAt(1.55)).toBe("beat");
    expect(await lightAt(2.05)).toBe("off");
    expect(await lightAt(3.05)).toBe("bar");
  });

  it("follows the tempo of the patch, after an undo for instance", async () => {
    display().focus();
    await userEvent.keyboard("{ArrowUp}");

    act(() => store.getState().undo());

    expect(display()).toHaveTextContent("120");
  });
});
