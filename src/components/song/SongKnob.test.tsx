import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPatchStore } from "../../store/patchStore";
import { SongControlContext, type SongControl } from "./SongControlContext";
import { SongKnob, SongSwitch } from "./SongKnob";
import { SongRecorder, type RecorderEngine } from "./SongRecorder";

const RANGE = { min: 0, max: 100, step: 1, scale: "linear" } as const;
const KEY = "oscillator-1.detune";

let store: ReturnType<typeof createPatchStore>;
let position: number | undefined;
let playing: number | undefined;
let context: SongControl;
let onChange: ReturnType<typeof vi.fn<(value: number, options?: { merge?: boolean }) => void>>;

beforeEach(() => {
  Element.prototype.setPointerCapture ??= () => {};
  store = createPatchStore({ sync: vi.fn() });
  store.getState().addNode("oscillator", { x: 0, y: 0 });
  position = 4;
  playing = undefined;
  const engine: RecorderEngine & SongControl["engine"] = {
    getSongPosition: () => position,
    getControl: () => playing,
    holdControl: vi.fn(),
    setControl: vi.fn(),
    releaseControl: vi.fn(),
    state: "running",
    subscribe: () => () => {},
  };
  context = { engine, store, recorder: new SongRecorder(engine, store) };
  onChange = vi.fn<(value: number, options?: { merge?: boolean }) => void>();
});

const show = (value = 50, withSong = true) => {
  const knob = <SongKnob control={KEY} label="Detune" value={value} range={RANGE} onChange={onChange} format={String} parse={Number} />;
  render(withSong ? <SongControlContext value={context}>{knob}</SongControlContext> : knob);
};

const knob = () => screen.getByRole("slider", { name: "Detune" });

/** A crossfader that plays the knob at `value`, or leaves it while undefined. */
const crossfaderAt = (value: number | undefined) => {
  const listeners = new Set<() => void>();
  const crossfader = {
    value,
    valueOf: (key: string) => (key === KEY ? crossfader.value : undefined),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    release: vi.fn((key: string) => {
      if (key === KEY) {
        crossfader.value = undefined;
        listeners.forEach((listener) => listener());
      }
    }),
  };
  return crossfader;
};

describe("SongKnob and the crossfader", () => {
  it("shows the value the crossfader plays the knob at", () => {
    context = { ...context, crossfader: crossfaderAt(80) };
    show(50);

    expect(knob()).toHaveAttribute("aria-valuenow", "80");
  });

  it("leaves the knob to the hand that turns it, which changes the patch", () => {
    const crossfader = crossfaderAt(80);
    context = { ...context, crossfader };
    show(50);

    knob().focus();
    fireEvent.keyDown(knob(), { key: "ArrowUp" });

    expect(crossfader.release).toHaveBeenCalledWith(KEY);
    expect(onChange).toHaveBeenCalledWith(81);
    expect(knob()).toHaveAttribute("aria-valuenow", "50");
  });
});

describe("SongKnob", () => {
  it("is a plain knob without a song", () => {
    show(50, false);

    fireEvent.pointerDown(knob(), { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(knob(), { clientY: 60, pointerId: 1 });

    expect(onChange).toHaveBeenCalled();
  });

  it("changes the patch in pattern mode", () => {
    show();

    knob().focus();
    fireEvent.keyDown(knob(), { key: "ArrowUp" });

    expect(onChange).toHaveBeenCalledWith(51);
  });

  it("with Rec in song mode, records a drag into the song instead of the patch", () => {
    act(() => {
      store.getState().setSongMode(true);
      store.getState().setSongRec(true);
    });
    show();

    fireEvent.pointerDown(knob(), { clientY: 100, pointerId: 1 });
    position = 5;
    fireEvent.pointerMove(knob(), { clientY: 60, pointerId: 1 });
    position = 6;
    fireEvent.pointerUp(knob(), { pointerId: 1 });

    expect(onChange).not.toHaveBeenCalled();
    expect(store.getState().song?.automation?.[KEY]).toBe("4:50 5:75");
  });

  it("shows the value of the song while it plays in song mode", async () => {
    playing = 80;
    act(() => store.getState().setSongMode(true));
    show();

    await waitFor(() => expect(knob()).toHaveAttribute("aria-valuetext", "80"));
  });

  it("shows the value the song has on the cursor with Rec while it is stopped", async () => {
    position = undefined;
    act(() => {
      store.getState().setControlPoint(KEY, 8, 20);
      store.getState().setSongCursor(2);
      store.getState().setSongMode(true);
      store.getState().setSongRec(true);
    });
    show();

    await waitFor(() => expect(knob()).toHaveAttribute("aria-valuetext", "20"));
  });

  it("finds the bar of the cursor in bars of the meter", async () => {
    position = undefined;
    act(() => {
      store.getState().setMeter([3]);
      store.getState().setControlPoint(KEY, 6, 20);
      store.getState().setControlPoint(KEY, 8, 30);
      store.getState().setSongCursor(2);
      store.getState().setSongMode(true);
      store.getState().setSongRec(true);
    });
    show();

    await waitFor(() => expect(knob()).toHaveAttribute("aria-valuetext", "20"));
  });
});

describe("SongSwitch", () => {
  it("flips the switch in the song with Rec in song mode, and in the patch otherwise", () => {
    store.getState().addNode("mixer", { x: 0, y: 0 });
    const cable = store.getState().connect({ nodeId: "oscillator-1", port: "audio" }, { nodeId: "mixer-2", port: "audio" })!;
    const onFlip = vi.fn();
    const view = (on: boolean) => (
      <SongControlContext value={context}>
        <SongSwitch control={`${cable.id}.mute`} on={on} onFlip={onFlip}>
          {(pressed, flip) => (
            <button type="button" aria-pressed={pressed} onClick={flip}>
              M
            </button>
          )}
        </SongSwitch>
      </SongControlContext>
    );
    const { rerender } = render(view(false));

    fireEvent.click(screen.getByRole("button", { name: "M" }));
    expect(onFlip).toHaveBeenCalledWith(true);

    act(() => {
      store.getState().setSongMode(true);
      store.getState().setSongRec(true);
    });
    rerender(view(false));
    fireEvent.click(screen.getByRole("button", { name: "M" }));

    expect(onFlip).toHaveBeenCalledTimes(1);
    expect(store.getState().song?.automation?.[`${cable.id}.mute`]).toBe("4:1");
  });
});
