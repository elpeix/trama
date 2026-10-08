import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPatchStore } from "../../store/patchStore";
import { PatchStoreContext } from "../../store/usePatchStore";
import { SongControlContext, type SongControl } from "../song/SongControlContext";
import { SongRecorder, type RecorderEngine } from "../song/SongRecorder";
import { Crossfader } from "./Crossfader";

let store: ReturnType<typeof createPatchStore>;
let filter: string;
let frequency: string;

beforeEach(() => {
  store = createPatchStore({ sync: vi.fn() });
  const seq = store.getState().addNode("sequencer", { x: 0, y: 0 }).id;
  filter = store.getState().addNode("filter", { x: 0, y: 0 }).id;
  frequency = `${filter}.frequency`;
  store.getState().togglePinned(frequency);
  store.getState().updateParam(filter, "frequency", 200);
  store.getState().saveScene({ [seq]: "A1" });
  store.getState().updateParam(filter, "frequency", 2000);
  store.getState().saveScene({ [seq]: "B1" });
  store.getState().renameScene(1, "Drop");
  store.getState().updateParam(filter, "frequency", 800);
});

const show = (song?: SongControl) => {
  const crossfader = <Crossfader />;
  render(
    <PatchStoreContext value={store}>{song ? <SongControlContext value={song}>{crossfader}</SongControlContext> : crossfader}</PatchStoreContext>,
  );
};

const side = (name: "A" | "B") => screen.getByRole("combobox", { name: `Scene ${name}` });
const fader = () => screen.getByRole("slider", { name: "Crossfader" });
const apply = () => screen.getByRole("button", { name: "Apply" });

describe("Crossfader", () => {
  it("shows nothing without scenes", () => {
    store.getState().removeScene(1);
    store.getState().removeScene(0);
    show();

    expect(screen.queryByRole("group", { name: "Crossfader" })).toBeNull();
  });

  it("picks a scene for each side among the scenes, or none", () => {
    show();

    expect([...side("A").querySelectorAll("option")].map((option) => option.textContent)).toEqual(["—", "Scene 1", "Drop"]);
    fireEvent.change(side("A"), { target: { value: "0" } });
    fireEvent.change(side("B"), { target: { value: "1" } });
    expect(store.getState().crossfader).toEqual({ a: 0, b: 1, position: 0.5 });

    fireEvent.change(side("A"), { target: { value: "" } });
    expect(store.getState().crossfader).toEqual({ b: 1, position: 0.5 });
  });

  it("moves from A to B with the fader", () => {
    show();

    fireEvent.change(fader(), { target: { value: "0.25" } });

    expect(store.getState().crossfader.position).toBe(0.25);
    expect(fader()).toHaveValue("0.25");
  });

  it("writes what it plays into the patch with Apply, once a side has a scene", () => {
    show();
    expect(apply()).toBeDisabled();

    fireEvent.change(side("A"), { target: { value: "0" } });
    fireEvent.change(side("B"), { target: { value: "1" } });
    fireEvent.change(fader(), { target: { value: "0" } });
    fireEvent.click(apply());

    expect(store.getState().nodes.find(({ id }) => id === filter)?.params.frequency).toBe(200);
  });

  it("with Rec while the song plays, records the knobs it moves into the song as it is dragged", () => {
    let position = 4;
    const engine: RecorderEngine & SongControl["engine"] = {
      getSongPosition: () => position,
      getControl: () => undefined,
      holdControl: vi.fn(),
      setControl: vi.fn(),
      releaseControl: vi.fn(),
      state: "running",
      subscribe: () => () => {},
    };
    store.getState().setSongMode(true);
    store.getState().setSongRec(true);
    store.getState().setCrossfader({ a: 0, b: 1, position: 0 });
    show({ engine, store, recorder: new SongRecorder(engine, store) });

    fireEvent.pointerDown(fader(), { pointerId: 1 });
    position = 5;
    fireEvent.change(fader(), { target: { value: "1" } });
    fireEvent.pointerUp(fader(), { pointerId: 1 });

    expect(store.getState().song?.automation?.[frequency]).toBe("4:200 5:2000");
  });
});
