import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useComputerKeyboard, type NotePlayer } from "./useComputerKeyboard";

let player: { [K in keyof NotePlayer]: ReturnType<typeof vi.fn> };

function Harness() {
  const { octave, up, held, changeOctave, press: pressKey, release: releaseKey } = useComputerKeyboard(
    player as unknown as NotePlayer,
  );
  return (
    <>
      <output aria-label="octave">{octave}</output>
      <output aria-label="up">{String(up)}</output>
      <output aria-label="held">{[...held].map(([key, note]) => `${key}${note}`).join(" ")}</output>
      <button type="button" onClick={() => changeOctave(1)}>
        up
      </button>
      <button type="button" onClick={() => pressKey(0)}>
        press A
      </button>
      <button type="button" onClick={() => pressKey(4)}>
        press D
      </button>
      <button type="button" onClick={() => releaseKey(0)}>
        release A
      </button>
      <input aria-label="text" />
      <select aria-label="choice">
        <option>a</option>
      </select>
    </>
  );
}

const octave = () => Number(screen.getByRole("status", { name: "octave" }).textContent);
const shown = (name: string) => screen.getByRole("status", { name }).textContent;
type KeyInit = {
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  repeat?: boolean;
  modifierCapsLock?: boolean;
};
const press = (key: string, init: KeyInit = {}) =>
  fireEvent.keyDown(window, { key, ...init });

beforeEach(() => {
  player = { noteOn: vi.fn(), noteOff: vi.fn(), allNotesOff: vi.fn() };
  render(<Harness />);
});

describe("useComputerKeyboard", () => {
  it.each([
    ["a", 60],
    ["w", 61],
    ["s", 62],
    ["e", 63],
    ["d", 64],
    ["f", 65],
    ["t", 66],
    ["g", 67],
    ["y", 68],
    ["h", 69],
    ["u", 70],
    ["j", 71],
    ["k", 72],
  ])("plays %s as note %i", (key, note) => {
    press(key);

    expect(player.noteOn).toHaveBeenCalledWith(note);
  });

  it("ignores the case of the key", () => {
    press("A");

    expect(player.noteOn).toHaveBeenCalledWith(60);
  });

  it("releases the note on key up", () => {
    press("a");
    fireEvent.keyUp(window, { key: "a" });

    expect(player.noteOff).toHaveBeenCalledWith(60);
  });

  it("ignores auto-repeat, and a key that is already down", () => {
    press("a");
    press("a", { repeat: true });
    press("A", { shiftKey: true });

    expect(player.noteOn).toHaveBeenCalledTimes(1);
  });

  it("ignores keys that are not notes", () => {
    press("Backspace");

    expect(player.noteOn).not.toHaveBeenCalled();
  });

  it("ignores shortcuts with modifiers", () => {
    press("a", { metaKey: true });
    press("s", { ctrlKey: true });

    expect(player.noteOn).not.toHaveBeenCalled();
  });

  it("ignores typing in form fields", () => {
    fireEvent.keyDown(document.querySelector("input")!, { key: "a" });
    fireEvent.keyDown(document.querySelector("select")!, { key: "a" });
    fireEvent.keyDown(document.querySelector("input")!, { key: "x" });

    expect(player.noteOn).not.toHaveBeenCalled();
    expect(octave()).toBe(0);
  });

  it("releases everything when the window loses focus", () => {
    press("a");
    press("Shift", { shiftKey: true });
    fireEvent.blur(window);
    fireEvent.keyUp(window, { key: "a" });

    expect(player.allNotesOff).toHaveBeenCalled();
    expect(player.noteOff).not.toHaveBeenCalled();
    expect(shown("held")).toBe("");
    expect(shown("up")).toBe("false");
  });

  it("tells which keys are down, and the note each one started", () => {
    press("a");
    press("G", { shiftKey: true });
    expect(shown("held")).toBe("a60 g79");

    fireEvent.keyUp(window, { key: "a", shiftKey: true });
    expect(shown("held")).toBe("g79");
  });

  describe("Shift", () => {
    it("tells while it is held", () => {
      press("Shift", { shiftKey: true });
      expect(shown("up")).toBe("true");

      fireEvent.keyUp(window, { key: "Shift" });
      expect(shown("up")).toBe("false");
    });

    it("plays one octave up while held", () => {
      press("A", { shiftKey: true });

      expect(player.noteOn).toHaveBeenCalledWith(72);
    });

    it("stops the note a key started, even when Shift is let go first", () => {
      press("A", { shiftKey: true });
      fireEvent.keyUp(window, { key: "Shift" });
      fireEvent.keyUp(window, { key: "a" });

      expect(player.noteOff).toHaveBeenCalledExactlyOnceWith(72);
    });

    it("mixes notes with and without Shift, for chords over more than an octave", () => {
      press("a");
      press("G", { shiftKey: true });

      expect(player.noteOn.mock.calls).toEqual([[60], [79]]);
    });
  });

  describe("Caps Lock", () => {
    const capsLock = { modifierCapsLock: true };

    it("keeps the keys one octave up, and lights UP", () => {
      press("A", capsLock);

      expect(player.noteOn).toHaveBeenCalledWith(72);
      expect(shown("up")).toBe("true");
    });

    it("brings them back down with Shift", () => {
      press("a", { ...capsLock, shiftKey: true });

      expect(player.noteOn).toHaveBeenCalledWith(60);
      expect(shown("up")).toBe("false");
    });

    it("lights UP as soon as it is turned on, and off", () => {
      press("CapsLock", capsLock);
      expect(shown("up")).toBe("true");

      press("CapsLock");
      expect(shown("up")).toBe("false");
    });

    it("still lets Z and X move the octave", () => {
      press("X", capsLock);

      expect(octave()).toBe(1);
      expect(player.noteOn).not.toHaveBeenCalled();
    });
  });

  describe("Z and X", () => {
    it("move the keys an octave down or up until moved back", () => {
      press("x");
      press("a");
      expect(octave()).toBe(1);
      expect(player.noteOn).toHaveBeenLastCalledWith(72);

      press("z");
      press("z");
      press("s");
      expect(octave()).toBe(-1);
      expect(player.noteOn).toHaveBeenLastCalledWith(50);
    });

    it("go no further than three octaves either way", () => {
      for (let time = 0; time < 5; time++) {
        press("x");
      }
      expect(octave()).toBe(3);

      for (let time = 0; time < 8; time++) {
        press("z");
      }
      expect(octave()).toBe(-3);
    });

    it("are not notes, and leave undo and other shortcuts alone", () => {
      press("z", { ctrlKey: true });
      press("z", { metaKey: true });
      press("Z", { shiftKey: true });
      press("x", { repeat: true });

      expect(octave()).toBe(0);
      expect(player.noteOn).not.toHaveBeenCalled();
    });

    it("can also be moved from elsewhere, like the buttons of a node", () => {
      fireEvent.click(screen.getByRole("button", { name: "up" }));
      press("a");

      expect(octave()).toBe(1);
      expect(player.noteOn).toHaveBeenCalledWith(72);
    });

    it("leave a note that is down to stop where it started", () => {
      press("a");
      press("x");
      fireEvent.keyUp(window, { key: "a" });

      expect(player.noteOff).toHaveBeenCalledExactlyOnceWith(60);
    });
  });

  describe("keys pressed with the mouse", () => {
    const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));

    it("plays the note of the key, like its letter, and lights it", () => {
      click("press D");

      expect(player.noteOn).toHaveBeenCalledWith(64);
      expect(shown("held")).toBe("d64");
    });

    it("plays at the octave of the keys, and one up with Shift or Caps Lock", () => {
      click("up");
      click("press A");
      expect(player.noteOn).toHaveBeenLastCalledWith(72);
      click("release A");

      press("CapsLock", { modifierCapsLock: true });
      click("press A");
      expect(player.noteOn).toHaveBeenLastCalledWith(84);
    });

    it("stops the note it started, even once the octave moved", () => {
      click("press A");
      click("up");
      click("release A");

      expect(player.noteOff).toHaveBeenCalledWith(60);
      expect(shown("held")).toBe("");
    });

    it("leaves a key already down on the computer to its letter", () => {
      press("a");
      click("press A");
      click("release A");

      expect(player.noteOn).toHaveBeenCalledTimes(1);
      expect(player.noteOff).not.toHaveBeenCalled();
      fireEvent.keyUp(window, { key: "a" });
      expect(player.noteOff).toHaveBeenCalledWith(60);
    });

    it("does nothing on letting go of a key it did not press", () => {
      click("release A");

      expect(player.noteOff).not.toHaveBeenCalled();
    });
  });
});
