import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReactFlowProvider } from "@xyflow/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPatchStore } from "../store/patchStore";
import { PatchStoreContext } from "../store/usePatchStore";
import { ArrangeButton } from "./ArrangeButton";

let store: ReturnType<typeof createPatchStore>;

beforeEach(() => {
  store = createPatchStore({ sync: vi.fn() });
});

const setup = () =>
  render(
    <PatchStoreContext value={store}>
      <ReactFlowProvider>
        <ArrangeButton />
      </ReactFlowProvider>
    </PatchStoreContext>,
  );

const positions = () => store.getState().nodes.map(({ position }) => position);

describe("ArrangeButton", () => {
  it("lays the modules out along the signal, as one undo step", async () => {
    const oscillator = store.getState().addNode("oscillator", { x: 500, y: 500 });
    const output = store.getState().addNode("output", { x: -300, y: 900 });
    store.getState().connect({ nodeId: oscillator.id, port: "audio" }, { nodeId: output.id, port: "audio" });
    const before = positions();
    setup();

    await userEvent.click(screen.getByRole("button", { name: "Arrange modules" }));

    const [placedOscillator, placedOutput] = positions();
    expect(placedOscillator).toEqual({ x: 0, y: 0 });
    expect(placedOutput.x).toBeGreaterThan(0);
    expect(placedOutput.y).toBe(0);
    store.getState().undo();
    expect(positions()).toEqual(before);
  });

  it("uses the size each module was measured at", async () => {
    const oscillator = store.getState().addNode("oscillator", { x: 0, y: 0 });
    const output = store.getState().addNode("output", { x: 0, y: 0 });
    store.getState().connect({ nodeId: oscillator.id, port: "audio" }, { nodeId: output.id, port: "audio" });
    store.getState().setNodeView(oscillator.id, { measured: { width: 900, height: 100 } });
    setup();

    await userEvent.click(screen.getByRole("button", { name: "Arrange modules" }));

    expect(positions()[1].x).toBeGreaterThan(900);
  });
});
