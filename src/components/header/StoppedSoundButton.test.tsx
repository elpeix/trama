import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioEngine } from "../../audio/AudioEngine";
import { FakeAudioContext } from "../../test/fakeAudioContext";
import { STOPPED_SOUND_KEY, StoppedSoundButton } from "./StoppedSoundButton";

let context: FakeAudioContext;
let engine: AudioEngine;

const memory = (kept: Record<string, string> = {}) => ({
  getItem: (key: string) => kept[key] ?? null,
  setItem: (key: string, value: string) => {
    kept[key] = value;
  },
  kept,
});

beforeEach(() => {
  context = new FakeAudioContext();
  engine = new AudioEngine(context.asAudioContext());
});

const button = () => screen.getByRole("button", { name: "Sound without play" });

describe("StoppedSoundButton", () => {
  it("lets the keys sound while stopped, unless this browser chose otherwise", () => {
    render(<StoppedSoundButton engine={engine} storage={memory()} />);

    expect(button()).toHaveAttribute("aria-pressed", "true");
    engine.noteOn(60);
    expect(context.state).toBe("running");
    expect(engine.state).toBe("suspended");
  });

  it("keeps them quiet while stopped once turned off, and remembers it in this browser", async () => {
    const storage = memory();
    render(<StoppedSoundButton engine={engine} storage={storage} />);

    await userEvent.click(button());

    expect(button()).toHaveAttribute("aria-pressed", "false");
    expect(storage.kept[STOPPED_SOUND_KEY]).toBe("off");
    engine.noteOn(60);
    expect(context.state).toBe("suspended");
  });

  it("starts as this browser left it", () => {
    render(<StoppedSoundButton engine={engine} storage={memory({ [STOPPED_SOUND_KEY]: "off" })} />);

    expect(button()).toHaveAttribute("aria-pressed", "false");
    engine.noteOn(60);
    expect(context.state).toBe("suspended");
  });

  it("works without a storage the browser lets it use", async () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    render(<StoppedSoundButton engine={engine} storage={broken} />);

    await userEvent.click(button());

    expect(button()).toHaveAttribute("aria-pressed", "false");
  });

  describe("its tooltip", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("tells what it is for once the pointer rests on it a moment", () => {
      render(<StoppedSoundButton engine={engine} storage={memory()} />);

      fireEvent.pointerEnter(button());
      expect(screen.queryByRole("tooltip")).toBeNull();
      act(() => vi.advanceTimersByTime(400));

      expect(screen.getByRole("tooltip")).toHaveTextContent(/without pressing play/);
      expect(screen.getByRole("tooltip")).toHaveTextContent(/On/);
      expect(screen.getByRole("tooltip")).toHaveTextContent(/piano roll sound with its own Hear/);
      expect(button()).toHaveAccessibleDescription(/without pressing play/);
      fireEvent.pointerLeave(button());
      expect(screen.queryByRole("tooltip")).toBeNull();
    });

    it("tells it is off once turned off", async () => {
      render(<StoppedSoundButton engine={engine} storage={memory({ [STOPPED_SOUND_KEY]: "off" })} />);

      act(() => button().focus());

      expect(screen.getByRole("tooltip")).toHaveTextContent(/Off/);
    });

    it("leaves no title of the browser over it", () => {
      render(<StoppedSoundButton engine={engine} storage={memory()} />);

      expect(button()).not.toHaveAttribute("title");
    });
  });
});
