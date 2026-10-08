import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPatchStore } from "../store/patchStore";
import { useClipboardShortcuts } from "./useClipboardShortcuts";

let store: ReturnType<typeof createPatchStore>;

function Shortcuts() {
  useClipboardShortcuts(store);
  return <input aria-label="Name" />;
}

beforeEach(() => {
  store = createPatchStore({ sync: vi.fn() });
  render(<Shortcuts />);
});

const types = () => store.getState().nodes.map(({ type }) => type);
const press = (key: string, options: { ctrlKey?: boolean; metaKey?: boolean } = { ctrlKey: true }) =>
  fireEvent.keyDown(window, { key, ...options });

describe("useClipboardShortcuts", () => {
  it("copies the selected nodes with Ctrl or Cmd and C, and pastes them with V", () => {
    const { id } = store.getState().addNode("filter", { x: 0, y: 0 });
    store.getState().setNodeView(id, { selected: true });

    press("c", { metaKey: true });
    const pasted = !press("v");

    expect(types()).toEqual(["filter", "filter"]);
    expect(pasted).toBe(true);
  });

  it("duplicates the selected nodes with Ctrl or Cmd and D, instead of bookmarking the page", () => {
    const { id } = store.getState().addNode("filter", { x: 0, y: 0 });
    store.getState().setNodeView(id, { selected: true });

    const handled = !press("d");

    expect(types()).toEqual(["filter", "filter"]);
    expect(handled).toBe(true);
  });

  it("leaves the keys to the browser with nothing selected or nothing copied", () => {
    store.getState().addNode("filter", { x: 0, y: 0 });

    expect(press("c")).toBe(true);
    expect(press("v")).toBe(true);
    expect(press("d")).toBe(true);
    expect(types()).toEqual(["filter"]);
  });

  it("does nothing while typing", () => {
    const { id } = store.getState().addNode("filter", { x: 0, y: 0 });
    store.getState().setNodeView(id, { selected: true });

    fireEvent.keyDown(screen.getByRole("textbox", { name: "Name" }), { key: "d", ctrlKey: true });

    expect(types()).toEqual(["filter"]);
  });
});
