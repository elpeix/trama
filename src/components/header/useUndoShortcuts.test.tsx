import { fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPatchStore } from "../../store/patchStore";
import { useUndoShortcuts } from "./useUndoShortcuts";

let store: ReturnType<typeof createPatchStore>;

function Harness() {
  useUndoShortcuts(store);
  return <input aria-label="text" />;
}

beforeEach(() => {
  store = createPatchStore({ sync: vi.fn() });
  render(<Harness />);
  store.getState().addNode("gain", { x: 0, y: 0 });
});

describe("useUndoShortcuts", () => {
  it.each([
    ["Cmd+Z", { metaKey: true }],
    ["Ctrl+Z", { ctrlKey: true }],
  ])("undoes with %s", (_name, modifiers) => {
    fireEvent.keyDown(window, { key: "z", ...modifiers });

    expect(store.getState().nodes).toEqual([]);
  });

  it.each([
    ["Shift+Cmd+Z", { key: "z", metaKey: true, shiftKey: true }],
    ["Shift+Ctrl+Z", { key: "Z", ctrlKey: true, shiftKey: true }],
    ["Ctrl+Y", { key: "y", ctrlKey: true }],
  ])("redoes with %s", (_name, event) => {
    store.getState().undo();

    fireEvent.keyDown(window, event);

    expect(store.getState().nodes).toHaveLength(1);
  });

  it("keeps the browser from handling the shortcut", () => {
    const allowed = fireEvent.keyDown(window, { key: "z", metaKey: true });

    expect(allowed).toBe(false);
  });

  it("leaves text fields their own undo", () => {
    fireEvent.keyDown(document.querySelector("input")!, { key: "z", metaKey: true });

    expect(store.getState().nodes).toHaveLength(1);
  });

  it("ignores z without a modifier", () => {
    fireEvent.keyDown(window, { key: "z" });

    expect(store.getState().nodes).toHaveLength(1);
  });
});
