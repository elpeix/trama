import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { moduleRegistry, type SelectParamDefinition } from "../../patch/registry";
import type { PatternSlot } from "../../patch/types";
import { createPatchStore } from "../../store/patchStore";
import { PatchStoreContext } from "../../store/usePatchStore";
import { displayEngine } from "../../test/displayEngine";
import type { DisplayEngine } from "../EngineContext";
import { EngineContext } from "../EngineContext";
import { PatternSlots } from "./PatternSlots";

const launch = moduleRegistry.sequencer.params.find(
  (param): param is SelectParamDefinition => param.id === "launch" && param.kind === "select",
)!;

let store: ReturnType<typeof createPatchStore>;
let engine: DisplayEngine;
let seq: string;

beforeEach(() => {
  store = createPatchStore({ sync: vi.fn() });
  seq = store.getState().addNode("sequencer", { x: 0, y: 0 }).id;
  engine = displayEngine();
});

const show = (nodeId = seq, editing: PatternSlot = "A1", onEdit = vi.fn()) =>
  render(
    <PatchStoreContext value={store}>
      <EngineContext value={engine}>
        <PatternSlots nodeId={nodeId} editing={editing} onEdit={onEdit} launch={launch} launchMode="bar" onLaunchMode={vi.fn()} />
      </EngineContext>
    </PatchStoreContext>,
  );

describe("PatternSlots banks", () => {
  it("shows the four banks, and the eight patterns of the bank of the pattern edited", () => {
    show(seq, "C3");

    const banks = screen.getByRole("group", { name: "Banks" });
    expect(within(banks).getAllByRole("button").map((button) => button.textContent)).toEqual(["A", "B", "C", "D"]);
    expect(within(banks).getByRole("button", { name: "Bank C" })).toHaveAttribute("aria-pressed", "true");
    const pads = screen.getAllByRole("button", { name: /^Pattern / });
    expect(pads.map((pad) => pad.getAttribute("aria-label"))).toEqual(["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8"].map((slot) => `Pattern ${slot}`));
    expect(pads.map((pad) => pad.textContent)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);
    expect(screen.getByRole("button", { name: "Pattern C3" })).toHaveAttribute("aria-pressed", "true");
  });

  it("marks each bank with its letter, and the pads with the bank they show, for their colour", () => {
    show(seq, "B2");

    const banks = within(screen.getByRole("group", { name: "Banks" })).getAllByRole("button");
    expect(banks.map((button) => button.getAttribute("data-bank"))).toEqual(["A", "B", "C", "D"]);
    expect(screen.getByRole("button", { name: "Pattern B2" }).parentElement).toHaveAttribute("data-bank", "B");
  });

  it("edits the pattern of the same number in a bank clicked", () => {
    const onEdit = vi.fn();
    show(seq, "A3", onEdit);

    fireEvent.click(screen.getByRole("button", { name: "Bank D" }));

    expect(onEdit).toHaveBeenCalledWith("D3");
  });

  it("lights the bank of the pattern that plays, and makes the bank of the one launched blink", async () => {
    engine = displayEngine({ getPattern: vi.fn(() => ({ playing: "B2" as const, queued: "C5" as const })) });
    show();

    await waitFor(() => expect(screen.getByRole("button", { name: "Bank B" })).toHaveAttribute("data-playing"));
    expect(screen.getByRole("button", { name: "Bank C" })).toHaveAttribute("data-queued");
    expect(screen.getByRole("button", { name: "Bank A" })).not.toHaveAttribute("data-playing");
    expect(screen.getByRole("button", { name: "Pattern A2" })).not.toHaveAttribute("data-playing");
  });

  it("turns the lights off once a stop of the song silences the node", async () => {
    let stopped = false;
    engine = displayEngine({ getPattern: vi.fn(() => ({ playing: "B2" as const, ...(stopped && { stopped: true }) })) });
    show(seq, "B1");
    await waitFor(() => expect(screen.getByRole("button", { name: "Bank B" })).toHaveAttribute("data-playing"));

    stopped = true;

    await waitFor(() => expect(screen.getByRole("button", { name: "Bank B" })).not.toHaveAttribute("data-playing"));
    expect(screen.getByRole("button", { name: "Pattern B2" })).not.toHaveAttribute("data-playing");
  });
});

describe("PatternSlots", () => {
  it("launches a pattern on double-click, and writes nothing into the song without Rec", () => {
    show();

    fireEvent.doubleClick(screen.getByRole("button", { name: "Pattern A2" }));

    expect(engine.launchPattern).toHaveBeenCalledWith(seq, "A2");
    expect(store.getState().song).toBeUndefined();
  });

  it("with Rec and the song stopped, writes the pattern on the bar of the cursor", () => {
    store.getState().setSongRec(true);
    store.getState().setSongCursor(3);
    show();

    fireEvent.doubleClick(screen.getByRole("button", { name: "Pattern A3" }));

    expect(store.getState().song?.rows[seq]).toBe("- - - A3 - - - -");
    expect(engine.launchPattern).toHaveBeenCalledWith(seq, "A3");
  });

  it("with Rec and the song playing, writes it on the next bar and launches it for that bar", () => {
    store.getState().setSongRec(true);
    engine = displayEngine({ getSongBar: vi.fn(() => 1) });
    show();

    fireEvent.doubleClick(screen.getByRole("button", { name: "Pattern A4" }));

    expect(store.getState().song?.rows[seq]).toBe("- - A4 - - - - -");
    expect(engine.launchPattern).toHaveBeenCalledWith(seq, "A4", "bar");
  });

  it("with Rec on the last bar of a loop, writes it on the start of the loop", () => {
    store.getState().setSongLoop({ start: 2, length: 2 });
    store.getState().setSongRec(true);
    engine = displayEngine({ getSongBar: vi.fn(() => 3) });
    show();

    fireEvent.doubleClick(screen.getByRole("button", { name: "Pattern A2" }));

    expect(store.getState().song?.rows[seq]).toBe("- - A2 - - - - -");
  });

  it("with Rec on the last bar of the song, only launches it", () => {
    store.getState().setSongRec(true);
    engine = displayEngine({ getSongBar: vi.fn(() => 7) });
    show();

    fireEvent.doubleClick(screen.getByRole("button", { name: "Pattern A2" }));

    expect(store.getState().song?.rows ?? {}).toEqual({});
    expect(engine.launchPattern).toHaveBeenCalledWith(seq, "A2", "bar");
  });

  it("writes a node inside a subpatch by its path", () => {
    const sub = store.getState().addNode("subpatch", { x: 0, y: 0 }).id;
    store.getState().openSubpatch(sub);
    const inner = store.getState().addNode("clip", { x: 0, y: 0 }).id;
    store.getState().setSongRec(true);
    show(inner);

    fireEvent.doubleClick(screen.getByRole("button", { name: "Pattern A2" }));

    expect(store.getState().song?.rows[`${sub}/${inner}`]).toBe("A2 - - - - - - -");
  });
});
