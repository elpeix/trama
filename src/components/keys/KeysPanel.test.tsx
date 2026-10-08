import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { KeysContext } from "./KeysContext";
import { KeysPanel } from "./KeysPanel";
import type { KeysState } from "./useComputerKeyboard";

let view: ReturnType<typeof render>;
let keys: KeysState & { press: Mock<(index: number) => void>; release: Mock<(index: number) => void> };

beforeEach(() => {
  keys = {
    octave: 0,
    up: false,
    held: new Map([["d", 64]]),
    changeOctave: vi.fn(),
    press: vi.fn<(index: number) => void>(),
    release: vi.fn<(index: number) => void>(),
  };
  view = render(
    <KeysContext value={keys}>
      <KeysPanel nodeId="keyboard-1" transpose={0} />
    </KeysContext>,
  );
});

const piano = () => screen.getByRole("group", { name: /Computer keys/ });
const key = (letter: string) => within(piano()).getByRole("button", { name: letter });

describe("KeysPanel", () => {
  it("draws the computer keys as buttons, pressed while down", () => {
    expect(within(piano()).getAllByRole("button")).toHaveLength(13);
    expect(key("D")).toHaveAttribute("aria-pressed", "true");
    expect(key("A")).toHaveAttribute("aria-pressed", "false");
  });

  it("plays a key while the mouse holds it down, and stops it when let go, wherever", () => {
    fireEvent.pointerDown(key("S"), { button: 0, buttons: 1 });
    expect(keys.press).toHaveBeenCalledWith(2);

    fireEvent.pointerUp(document.body);
    expect(keys.release).toHaveBeenCalledWith(2);
  });

  it("slides from key to key while the mouse stays down", () => {
    fireEvent.pointerDown(key("A"), { button: 0, buttons: 1 });
    fireEvent.pointerEnter(key("W"), { buttons: 1 });
    fireEvent.pointerEnter(key("S"), { buttons: 0 });

    expect(keys.press.mock.calls).toEqual([[0], [1]]);
    expect(keys.release.mock.calls).toEqual([[0]]);
  });

  it("plays nothing with another button of the mouse", () => {
    fireEvent.pointerDown(key("A"), { button: 2, buttons: 2 });

    expect(keys.press).not.toHaveBeenCalled();
  });

  it("plays a key with Enter while it has the focus, and leaves Space to start and stop the audio", () => {
    fireEvent.keyDown(key("G"), { key: "Enter" });
    fireEvent.keyDown(key("G"), { key: "Enter", repeat: true });
    fireEvent.keyUp(key("G"), { key: "Enter" });
    const space = fireEvent.keyDown(key("F"), { key: " " });

    expect(keys.press.mock.calls).toEqual([[7]]);
    expect(keys.release.mock.calls).toEqual([[7]]);
    expect(space).toBe(true);
  });

  it("stops the key it plays when the node goes away", () => {
    fireEvent.pointerDown(key("A"), { button: 0, buttons: 1 });

    view.unmount();

    expect(keys.release).toHaveBeenCalledWith(0);
  });
});
