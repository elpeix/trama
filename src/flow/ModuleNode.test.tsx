import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReactFlowProvider } from "@xyflow/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPatchStore, type PatchEngine } from "../store/patchStore";
import { PatchStoreContext, usePatchStore } from "../store/usePatchStore";
import type { NodeType } from "../patch/types";
import type { NoteActivity, PatternState } from "../audio/modules/AudioModule";
import { EngineContext } from "../components/EngineContext";
import { KeysContext } from "../components/keys/KeysContext";
import type { KeysState } from "../components/keys/useComputerKeyboard";
import { displayEngine } from "../test/displayEngine";
import { SampleLibrary } from "../samples/sampleLibrary";
import { SamplesContext } from "../components/SamplesContext";
import { FakeAudioBuffer } from "../test/fakeAudioContext";
import { ModuleNode } from "./ModuleNode";
import { moduleRegistry } from "../patch/registry";
import { cellAt } from "../patch/song";
import { SongControlContext, type SongControl } from "../components/song/SongControlContext";
import { SongRecorder, type RecorderEngine } from "../components/song/SongRecorder";

let engine: PatchEngine;
let store: ReturnType<typeof createPatchStore>;

beforeEach(() => {
  engine = {
    sync: vi.fn(),
  };
  store = createPatchStore(engine);
});

const renderExisting = (id: string) => {
  const node = store.getState().nodes.find((candidate) => candidate.id === id)!;
  return render(
    <PatchStoreContext value={store}>
      <ReactFlowProvider>
        <ModuleNode id={node.id} data={{ type: node.type, name: node.name, params: node.params, patch: node.patch, published: node.published }} />
      </ReactFlowProvider>
    </PatchStoreContext>,
  );
};

const renderNode = (type: NodeType = "filter") => {
  const node = store.getState().addNode(type, { x: 0, y: 0 });
  return render(
    <PatchStoreContext value={store}>
      <ReactFlowProvider>
        <ModuleNode id={node.id} data={{ type: node.type, name: node.name, params: node.params }} />
      </ReactFlowProvider>
    </PatchStoreContext>,
  );
};

describe("ModuleNode", () => {
  describe("the help of a module", () => {
    const help = () => screen.getByRole("button", { name: "Help for Modal" });

    it("keeps the help out of the node, behind a question mark", () => {
      renderNode("modal");

      expect(help()).toHaveTextContent("?");
      expect(screen.queryByText(/Connect a gate to strike it/)).toBeNull();
      expect(screen.queryByRole("tooltip")).toBeNull();
    });

    describe("under the pointer", () => {
      beforeEach(() => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it("shows it once the pointer rests on the question mark a moment", () => {
        renderNode("modal");

        fireEvent.pointerEnter(help());
        expect(screen.queryByRole("tooltip")).toBeNull();
        act(() => vi.advanceTimersByTime(400));
        expect(screen.getByRole("tooltip")).toHaveTextContent(/Connect a gate to strike it/);
        expect(help()).toHaveAccessibleDescription(/Connect a gate to strike it/);

        fireEvent.pointerLeave(help());
        expect(screen.queryByRole("tooltip")).toBeNull();
      });

      it("does not flash it when the pointer only passes over", () => {
        renderNode("modal");

        fireEvent.pointerEnter(help());
        act(() => vi.advanceTimersByTime(200));
        fireEvent.pointerLeave(help());
        act(() => vi.advanceTimersByTime(1000));

        expect(screen.queryByRole("tooltip")).toBeNull();
      });
    });

    it("shows it while the question mark has the focus, until Escape", async () => {
      renderNode("modal");

      act(() => help().focus());
      expect(screen.getByRole("tooltip")).toHaveTextContent(/Connect a gate to strike it/);

      await userEvent.keyboard("{Escape}");
      expect(screen.queryByRole("tooltip")).toBeNull();
      expect(help()).toHaveFocus();
    });

    it("keeps it open with a click, and closes it with another", async () => {
      renderNode("modal");

      await userEvent.click(help());
      await userEvent.unhover(help());
      expect(screen.getByRole("tooltip")).toBeInTheDocument();
      expect(help()).toHaveAttribute("aria-expanded", "true");

      await userEvent.click(help());
      await userEvent.unhover(help());
      expect(screen.queryByRole("tooltip")).toBeNull();
    });

    it("closes it with a click anywhere else", async () => {
      renderNode("modal");
      await userEvent.click(help());
      await userEvent.unhover(help());

      await userEvent.click(document.body);

      expect(screen.queryByRole("tooltip")).toBeNull();
    });

    it("names the node by the name it was given", () => {
      const { id } = store.getState().addNode("modal", { x: 0, y: 0 });
      store.getState().renameNode(id, "Bell");
      renderExisting(id);

      expect(screen.getByRole("button", { name: "Help for Bell" })).toBeInTheDocument();
    });

    it("has no question mark on a module without help", () => {
      renderNode("filter");

      expect(screen.queryByRole("button", { name: /^Help for/ })).toBeNull();
    });
  });

  describe("an arpeggiator with notes of its own", () => {
    const renderArp = (params: Record<string, string>) => {
      const { id } = store.getState().addNode("arpeggiator", { x: 0, y: 0 });
      for (const [name, value] of Object.entries(params)) {
        store.getState().updateParam(id, name, value, { merge: false });
      }
      const node = store.getState().nodes[0];
      const view = render(
        <PatchStoreContext value={store}>
          <ReactFlowProvider>
            <ModuleNode id={id} data={{ type: node.type, params: node.params }} />
          </ReactFlowProvider>
        </PatchStoreContext>,
      );
      return { id, view };
    };
    const picker = () => screen.getByRole("group", { name: "Notes to play" });
    const notes = () => String(store.getState().nodes[0].params.notes);

    it("plays the computer keys until its source is set to notes", () => {
      renderArp({});

      expect(screen.getByRole("group", { name: /Computer keys/ })).toBeInTheDocument();
      expect(screen.queryByRole("group", { name: "Notes to play" })).toBeNull();
      expect(screen.getByRole("button", { name: "Help for Arp" })).toBeInTheDocument();
    });

    it("shows a piano of its notes instead of the keys, lit where it has one", () => {
      renderArp({ source: "notes", notes: "C4 E4 G4" });

      expect(screen.queryByRole("group", { name: /Computer keys/ })).toBeNull();
      expect(screen.queryByRole("button", { name: "Help for Arp" })).toBeNull();
      const lit = within(picker()).getAllByRole("button", { pressed: true });
      expect(lit.map((key) => key.textContent)).toEqual(["C", "E", "G"]);
      expect(within(picker()).getAllByRole("button")).toHaveLength(13);
    });

    it("takes a note away with a click on its key, as one undo step", async () => {
      renderArp({ source: "notes", notes: "C4 E4 G4" });

      await userEvent.click(within(picker()).getAllByRole("button")[4]);
      expect(notes()).toBe("C4 G4");

      store.getState().undo();
      expect(notes()).toBe("C4 E4 G4");
    });

    it("adds a note with a click on its key", async () => {
      renderArp({ source: "notes", notes: "C4 G4" });

      await userEvent.click(within(picker()).getAllByRole("button")[10]);

      expect(notes()).toBe("C4 G4 A#4");
    });
  });

  describe("a subpatch of several voices", () => {
    const renderSubpatch = (usage: () => { voices: number; needed: number } | undefined) => {
      const node = store.getState().addNode("subpatch", { x: 0, y: 0 });
      const display = displayEngine({ getVoiceUsage: vi.fn(usage) });
      render(
        <PatchStoreContext value={store}>
          <EngineContext value={display}>
            <ReactFlowProvider>
              <ModuleNode id={node.id} data={{ type: node.type, params: node.params }} />
            </ReactFlowProvider>
          </EngineContext>
        </PatchStoreContext>,
      );
    };

    it("says how many voices its notes needed when it has fewer, as their tails are then cut short", async () => {
      let usage = { voices: 4, needed: 3 };
      renderSubpatch(() => usage);

      expect(screen.queryByRole("status", { name: "Voices" })).toBeNull();

      usage = { voices: 4, needed: 6 };
      await waitFor(() => expect(screen.getByRole("status", { name: "Voices" })).toHaveTextContent("Its notes needed 6 voices"));
    });

    it("says nothing while it plays nothing", () => {
      renderSubpatch(() => undefined);

      expect(screen.queryByRole("status", { name: "Voices" })).toBeNull();
    });
  });

  describe("an audio input", () => {
    const renderInput = (status: () => string) => {
      const node = store.getState().addNode("audioInput", { x: 0, y: 0 });
      const display = displayEngine({ getInputStatus: vi.fn(() => status() as never) });
      render(
        <PatchStoreContext value={store}>
          <EngineContext value={display}>
            <ReactFlowProvider>
              <ModuleNode id={node.id} data={{ type: node.type, params: node.params }} />
            </ReactFlowProvider>
          </EngineContext>
        </PatchStoreContext>,
      );
    };

    it("shows the level coming in, and follows what the microphone is doing", async () => {
      let status = "asking";
      renderInput(() => status);

      expect(screen.getByRole("meter", { name: "Input level" })).toBeInTheDocument();
      expect(screen.getByRole("status", { name: "Microphone" })).toHaveTextContent("Asking for the microphone");

      status = "on";
      await waitFor(() => expect(screen.getByRole("status", { name: "Microphone" })).toHaveTextContent("Listening"));
    });

    it("says why it hears nothing when the microphone is blocked", () => {
      renderInput(() => "denied");

      expect(screen.getByRole("status", { name: "Microphone" })).toHaveTextContent("The microphone is blocked");
    });

    it("says when there is no microphone to listen to", () => {
      renderInput(() => "unavailable");

      expect(screen.getByRole("status", { name: "Microphone" })).toHaveTextContent("No microphone to listen to");
    });
  });

  describe("a sampler", () => {
    let samples: SampleLibrary;

    const renderSampler = (state: () => unknown) => {
      samples = new SampleLibrary();
      const node = store.getState().addNode("sampler", { x: 0, y: 0 });
      const display = displayEngine({ getSample: vi.fn(() => state() as never) });
      const Live = () => {
        const params = usePatchStore((current) => current.nodes.find(({ id }) => id === node.id)!.params);
        return <ModuleNode id={node.id} data={{ type: node.type, params }} />;
      };
      render(
        <PatchStoreContext value={store}>
          <EngineContext value={display}>
            <SamplesContext value={samples}>
              <ReactFlowProvider>
                <Live />
              </ReactFlowProvider>
            </SamplesContext>
          </EngineContext>
        </PatchStoreContext>,
      );
      return node.id;
    };
    const status = () => screen.getByRole("status", { name: "Sample file" });

    it("asks for a file while it has none, and keeps the file chosen as its sample", async () => {
      const id = renderSampler(() => ({ samples: [], playing: 0 }));
      expect(status()).toHaveTextContent("No sample");

      await userEvent.upload(screen.getByLabelText("Load sample file"), new File([new Uint8Array([3])], "kick.wav", { type: "audio/wav" }));

      const sample = () => String(store.getState().nodes.find((node) => node.id === id)!.params.sample);
      await waitFor(() => expect(sample()).not.toBe(""));
      expect(await samples.get(sample())).toMatchObject({ name: "kick.wav", type: "audio/wav" });
    });

    it("takes a file dropped on it", async () => {
      const id = renderSampler(() => ({ samples: [], playing: 0 }));
      const file = new File([new Uint8Array([3])], "snare.wav", { type: "audio/wav" });

      fireEvent.drop(screen.getByRole("img", { name: "Sample" }), { dataTransfer: { files: [file], types: ["Files"] } });

      await waitFor(() => expect(store.getState().nodes.find((node) => node.id === id)!.params.sample).not.toBe(""));
    });

    describe("with several samples", () => {
      const ready = (name: string, frames: number) => ({ status: "ready", name, buffer: new FakeAudioBuffer(frames, 48000) });
      const paramOf = (id: string) => String(store.getState().nodes.find((node) => node.id === id)!.params.sample);
      const three = { samples: [ready("hat-1.wav", 24000), ready("hat-2.wav", 48000), ready("hat-3.wav", 96000)], playing: 1 };
      const slot = (number: number) => screen.getByRole("button", { name: `Sample ${number}` });

      it("adds a file loaded to the samples it has, and every file dropped at once", async () => {
        const id = renderSampler(() => ({ samples: [], playing: 0 }));
        const file = (name: string) => new File([new Uint8Array([3])], name, { type: "audio/wav" });

        await userEvent.upload(screen.getByLabelText("Load sample file"), file("hat-1.wav"));
        await waitFor(() => expect(paramOf(id).split(" ")).toHaveLength(1));
        fireEvent.drop(screen.getByRole("img", { name: "Sample" }), { dataTransfer: { files: [file("hat-2.wav"), file("hat-3.wav")], types: ["Files"] } });

        await waitFor(() => expect(paramOf(id).split(" ")).toHaveLength(3));
      });

      it("shows a slot for each sample, lit on the one that plays, and the one picked on the screen", async () => {
        renderSampler(() => three);

        expect(slot(2)).toHaveAttribute("data-playing");
        expect(slot(1)).not.toHaveAttribute("data-playing");
        expect(status()).toHaveTextContent("hat-2.wav · 1.00 s");

        await userEvent.click(slot(3));

        expect(slot(3)).toHaveAttribute("aria-pressed", "true");
        expect(status()).toHaveTextContent("hat-3.wav · 2.00 s");
      });

      it("takes a sample out of its list", async () => {
        const id = renderSampler(() => three);
        store.getState().updateParam(id, "sample", "0000000000000001 0000000000000002 0000000000000003", { merge: false });

        await userEvent.click(screen.getByRole("button", { name: "Remove sample 2" }));

        expect(paramOf(id)).toBe("0000000000000001 0000000000000003");
      });

      it("shows Select only while Order is select", async () => {
        const id = renderSampler(() => three);
        expect(screen.getByRole("slider", { name: "Select" })).toBeInTheDocument();

        act(() => store.getState().updateParam(id, "order", "random", { merge: false }));
        await waitFor(() => expect(screen.queryByRole("slider", { name: "Select" })).toBeNull());

        act(() => store.getState().updateParam(id, "order", "cycle", { merge: false }));
        expect(screen.queryByRole("slider", { name: "Select" })).toBeNull();
      });

      it("loads no more once it holds as many as it can", async () => {
        const id = renderSampler(() => three);
        store.getState().updateParam(id, "sample", Array.from({ length: 8 }, (_, index) => `000000000000000${index}`).join(" "), {
          merge: false,
        });

        await waitFor(() => expect(screen.getByRole("button", { name: "Load" })).toBeDisabled());
      });
    });

    it("shows the name, the length and the shape of the sample it plays", async () => {
      const buffer = new FakeAudioBuffer(24000, 48000);
      renderSampler(() => ({ samples: [{ status: "ready", name: "kick.wav", buffer }], playing: 0 }));

      expect(status()).toHaveTextContent("kick.wav · 0.50 s");
      expect(screen.queryByRole("group", { name: "Samples" })).toBeNull();
      expect(document.querySelector(".sample-peaks")).not.toBeNull();
      expect(document.querySelector(".sample-region")).toHaveAttribute("width", "120");
    });

    it.each([
      [{ status: "missing" }, "not in this browser"],
      [{ status: "invalid", name: "notes.txt" }, "notes.txt is not audio"],
      [{ status: "loading", name: "kick.wav" }, "Loading kick.wav"],
    ])("tells what is wrong or going on: %o", (state, text) => {
      renderSampler(() => ({ samples: [state], playing: 0 }));

      expect(status()).toHaveTextContent(text);
    });
  });

  describe("a clip", () => {
    it("has patterns, and opens the piano roll on the one edited, following it while open", async () => {
      const { id } = store.getState().addNode("clip", { x: 0, y: 0 });
      const node = store.getState().nodes[0];
      render(
        <PatchStoreContext value={store}>
          <ReactFlowProvider>
            <ModuleNode id={id} data={{ type: node.type, params: node.params, patterns: node.patterns }} />
          </ReactFlowProvider>
        </PatchStoreContext>,
      );
      const slots = screen.getByRole("group", { name: "Patterns" });

      await userEvent.click(within(slots).getByRole("button", { name: "Pattern A2" }));
      await userEvent.click(screen.getByRole("button", { name: "Edit" }));
      expect(store.getState()).toMatchObject({ clipEditor: [id], clipPattern: "A2" });

      await userEvent.click(within(slots).getByRole("button", { name: "Pattern A3" }));
      expect(store.getState().clipPattern).toBe("A3");
    });
  });

  describe("arpeggiator rhythm", () => {
    const renderRhythm = (position?: number) => {
      const node = store.getState().addNode("arpeggiator", { x: 0, y: 0 });
      const display = displayEngine({ getPosition: () => position });
      const view = () => (
        <PatchStoreContext value={store}>
          <EngineContext value={display}>
            <ReactFlowProvider>
              <ModuleNode id={node.id} data={{ type: node.type, params: store.getState().nodes[0].params }} />
            </ReactFlowProvider>
          </EngineContext>
        </PatchStoreContext>
      );
      const { rerender } = render(view());
      return { id: node.id, refresh: () => rerender(view()) };
    };
    const row = () => screen.getByRole("group", { name: "Rhythm" });
    const step = (number: number) => within(row()).getByRole("button", { name: `Step ${number}` });
    const rhythm = () => store.getState().nodes[0].params.rhythm;

    it("shows 16 steps that all sound, the ones beyond its length dimmed, and a Length knob", () => {
      renderRhythm();

      expect(within(row()).getAllByRole("button")).toHaveLength(16);
      expect(within(row()).getAllByRole("button", { pressed: true })).toHaveLength(16);
      expect(step(8)).not.toHaveClass("rhythm-step-off");
      expect(step(9)).toHaveClass("rhythm-step-off");
      expect(screen.getByRole("slider", { name: "Length" })).toBeInTheDocument();
      expect(screen.queryByRole("slider", { name: "Rhythm" })).toBeNull();
    });

    it("silences a step and makes it sound again, each click one undo step", async () => {
      const { refresh } = renderRhythm();

      await userEvent.click(step(2));
      expect(rhythm()).toBe("x - x x x x x x x x x x x x x x");
      refresh();
      expect(step(2)).toHaveAttribute("aria-pressed", "false");

      await userEvent.click(step(2));
      expect(rhythm()).toBe("x x x x x x x x x x x x x x x x");

      store.getState().undo();
      expect(rhythm()).toBe("x - x x x x x x x x x x x x x x");
    });

    it("silences the steps it is dragged across, all as one undo step", async () => {
      renderRhythm();

      await userEvent.pointer([
        { keys: "[MouseLeft>]", target: step(3) },
        { target: step(4) },
        { target: step(5) },
        { keys: "[/MouseLeft]" },
      ]);

      expect(rhythm()).toBe("x x - - - x x x x x x x x x x x");
      store.getState().undo();
      expect(rhythm()).toBe("x x x x x x x x x x x x x x x x");
    });

    it("lights the step it is on", async () => {
      renderRhythm(2);

      await waitFor(() => expect(step(3)).toHaveClass("rhythm-step-playing"));
      expect(step(2)).not.toHaveClass("rhythm-step-playing");
    });
  });

  describe("subpatch", () => {
    it("has a port for each In and Out inside, named after them, and opens with its button", async () => {
      const subpatch = store.getState().addNode("subpatch", { x: 0, y: 0 });
      store.getState().openSubpatch(subpatch.id);
      const inlet = store.getState().addNode("inlet", { x: 0, y: 0 });
      store.getState().renameNode(inlet.id, "sound");
      store.getState().addNode("outlet", { x: 0, y: 0 });
      store.getState().closeSubpatch(0);
      const node = store.getState().nodes[0];
      const { container } = render(
        <PatchStoreContext value={store}>
          <ReactFlowProvider>
            <ModuleNode id={node.id} data={{ type: node.type, params: node.params, patch: node.patch }} />
          </ReactFlowProvider>
        </PatchStoreContext>,
      );

      expect([...container.querySelectorAll(".port-label")].map((label) => label.textContent)).toEqual([
        "sound in",
        "out 1 out",
      ]);
      expect(container.querySelector('.react-flow__handle[data-handleid="inlet-2"]')).not.toBeNull();

      await userEvent.click(screen.getByRole("button", { name: "Open" }));

      expect(store.getState().path).toEqual([subpatch.id]);
    });

    it("shows each control In as a knob with its name and its input, and sets its value from outside", () => {
      const subpatch = store.getState().addNode("subpatch", { x: 0, y: 0 });
      store.getState().openSubpatch(subpatch.id);
      const sound = store.getState().addNode("inlet", { x: 0, y: 0 });
      const cutoff = store.getState().addNode("inlet", { x: 0, y: 100 });
      store.getState().renameNode(cutoff.id, "cutoff");
      store.getState().updateParam(cutoff.id, "signal", "control", { merge: false });
      store.getState().closeSubpatch(0);
      const node = store.getState().nodes[0];
      const { container } = render(
        <PatchStoreContext value={store}>
          <ReactFlowProvider>
            <ModuleNode id={node.id} data={{ type: node.type, params: node.params, patch: node.patch }} />
          </ReactFlowProvider>
        </PatchStoreContext>,
      );

      expect([...container.querySelectorAll(".port-label")].map((label) => label.textContent)).toEqual(["in 1 in"]);
      expect(container.querySelector(`.react-flow__handle[data-handleid="${sound.id}"]`)).not.toBeNull();
      const knob = screen.getByRole("slider", { name: "cutoff" });
      expect(container.querySelector(`.react-flow__handle[data-handleid="${cutoff.id}"]`)).not.toBeNull();

      fireEvent.keyDown(knob, { key: "ArrowUp", shiftKey: true });

      expect(store.getState().nodes[0].patch!.nodes[1].params.value).toBe(0.1);
    });
  });

  describe("a subpatch of several voices", () => {
    it("has a Voices knob, and a port of notes for an In of notes, which plays a pitch, a gate, a velocity and notes inside", () => {
      const subpatch = store.getState().addNode("subpatch", { x: 0, y: 0 });
      store.getState().openSubpatch(subpatch.id);
      const inlet = store.getState().addNode("inlet", { x: 0, y: 0 });
      store.getState().updateParam(inlet.id, "signal", "notes", { merge: false });
      const inside = renderExisting(inlet.id);
      expect([...inside.container.querySelectorAll(".port-label")].map((label) => label.textContent)).toEqual([
        "pitch out",
        "gate out",
        "velocity out",
        "notes out",
      ]);
      inside.unmount();
      store.getState().closeSubpatch(0);
      const node = store.getState().nodes[0];
      const { container } = render(
        <PatchStoreContext value={store}>
          <ReactFlowProvider>
            <ModuleNode id={node.id} data={{ type: node.type, params: node.params, patch: node.patch }} />
          </ReactFlowProvider>
        </PatchStoreContext>,
      );

      expect(container.querySelector(`.port-notes[data-handleid="${inlet.id}"]`)).not.toBeNull();
      fireEvent.keyDown(screen.getByRole("slider", { name: "Voices" }), { key: "ArrowUp" });

      expect(store.getState().nodes[0].params.voices).toBe(2);
    });
  });

  describe("drums", () => {
    it("shows a row of steps for each drum, named, and switches a step of a row", () => {
      const { container } = renderNode("drums");

      expect([...container.querySelectorAll(".rhythm-label")].map((label) => label.textContent)).toEqual([
        "Kick",
        "Snare",
        "Clap",
        "Rim",
        "Lo tom",
        "Hi tom",
        "Hat",
        "Open",
        "Acc",
      ]);
      const snare = screen.getByRole("group", { name: "Snare" });
      fireEvent.click(within(snare).getByRole("button", { name: "Step 2" }), { detail: 0 });

      expect(String(store.getState().nodes[0].params.snare).split(" ")[1]).toBe("x");
    });

    it("tells in its hint how to make a step sound only some of the time, as the Seq does", async () => {
      renderNode("drums");
      renderNode("sequencer");

      await userEvent.hover(screen.getByRole("button", { name: "Help for Drums" }));
      expect(await screen.findByRole("tooltip")).toHaveTextContent(/right-click a step to make it sound only some of the time/);
      await userEvent.unhover(screen.getByRole("button", { name: "Help for Drums" }));
      await userEvent.hover(screen.getByRole("button", { name: "Help for Seq" }));
      expect(await screen.findByRole("tooltip")).toHaveTextContent(/the % row under it makes a note sound only some of the time/);
    });

    it("marks its steps by the beats and the groups of the meter, at the length of its steps", () => {
      store.getState().setMeter([3, 2]);
      const { id } = store.getState().addNode("drums", { x: 0, y: 0 });
      store.getState().updateParam(id, "division", "1/8", { merge: false });
      renderExisting(id);
      const kick = within(screen.getByRole("group", { name: "Kick" })).getAllByRole("button");
      const marks = kick.slice(0, 10).map((step) =>
        step.classList.contains("rhythm-step-group") ? "group" : step.classList.contains("rhythm-step-beat") ? "beat" : "-",
      );

      expect(marks).toEqual(["group", "-", "beat", "-", "beat", "-", "group", "-", "beat", "-"]);
    });

    it("keeps the row of an Arp without a name", () => {
      const { container } = renderNode("arpeggiator");

      expect(container.querySelectorAll(".rhythm")).toHaveLength(1);
      expect(container.querySelectorAll(".rhythm-label")).toHaveLength(0);
    });

    it("has a single pencil on an Arp, for its rhythm while it plays the keys", async () => {
      renderNode("arpeggiator");

      expect(screen.getAllByRole("button", { name: "Edit as text" })).toHaveLength(1);
      await userEvent.click(screen.getByRole("button", { name: "Edit as text" }));
      const dialog = screen.getByRole("dialog", { name: "Arp · A1" });
      expect(within(dialog).getAllByRole("textbox").map((field) => (field as HTMLInputElement).labels?.[0].textContent)).toEqual([
        "Rhythm",
      ]);
    });

    it("writes the rhythm and the notes of an Arp that plays its own as text, as one undo step", async () => {
      const { id } = store.getState().addNode("arpeggiator", { x: 0, y: 0 });
      store.getState().updateParam(id, "source", "notes", { merge: false });
      renderExisting(id);
      const before = store.getState().nodes[0].params;

      await userEvent.click(screen.getByRole("button", { name: "Edit as text" }));
      const dialog = screen.getByRole("dialog", { name: "Arp · A1" });
      const rhythm = within(dialog).getByRole("textbox", { name: "Rhythm" });
      const notes = within(dialog).getByRole("textbox", { name: "Notes" });
      expect(notes).toHaveValue("C4 E4 G4");
      await userEvent.clear(rhythm);
      await userEvent.type(rhythm, "x - x");
      await userEvent.clear(notes);
      await userEvent.type(notes, "a4 c4 e4{Enter}");

      const after = store.getState().nodes[0].params;
      expect(String(after.rhythm).split(" ").slice(0, 4)).toEqual(["x", "-", "x", "-"]);
      expect(after.notes).toBe("C4 E4 A4");
      store.getState().undo();
      expect(store.getState().nodes[0].params).toEqual(before);
    });
  });

  describe("steps as text", () => {
    const rests = (count: number) => Array.from({ length: count }, () => "-");

    it("opens the steps of a Seq as text, and applies them as one undo step", async () => {
      renderNode("sequencer");
      const before = store.getState().nodes[0].params.steps;

      await userEvent.click(screen.getByRole("button", { name: "Edit as text" }));
      const dialog = screen.getByRole("dialog", { name: "Seq · A1" });
      const steps = within(dialog).getByRole("textbox", { name: "Steps" });
      expect(steps).toHaveValue(before);
      await userEvent.clear(steps);
      await userEvent.type(steps, "c4 - eb4{Enter}");

      expect(screen.queryByRole("dialog")).toBeNull();
      expect(store.getState().nodes[0].params.steps).toBe(["C4", "-", "D#4", ...rests(13)].join(" "));
      store.getState().undo();
      expect(store.getState().nodes[0].params.steps).toBe(before);
    });

    it("opens every row of a Drums as text, and applies the rows changed as one undo step", async () => {
      renderNode("drums");
      const before = store.getState().nodes[0].params;

      await userEvent.click(screen.getByRole("button", { name: "Edit as text" }));
      const dialog = screen.getByRole("dialog", { name: "Drums · A1" });
      expect(within(dialog).getAllByRole("textbox").map((field) => (field as HTMLInputElement).labels?.[0].textContent)).toEqual([
        "Kick",
        "Snare",
        "Clap",
        "Rim",
        "Lo tom",
        "Hi tom",
        "Hat",
        "Open",
        "Acc",
      ]);
      await userEvent.clear(within(dialog).getByRole("textbox", { name: "Clap" }));
      await userEvent.type(within(dialog).getByRole("textbox", { name: "Clap" }), "- - - - x");
      await userEvent.clear(within(dialog).getByRole("textbox", { name: "Open" }));
      await userEvent.type(within(dialog).getByRole("textbox", { name: "Open" }), "- - x?50");
      await userEvent.click(within(dialog).getByRole("button", { name: "Apply" }));

      const after = store.getState().nodes[0].params;
      expect(after.clap).toBe(["-", "-", "-", "-", "x", ...rests(11)].join(" "));
      expect(after.open).toBe(["-", "-", "x?50", ...rests(13)].join(" "));
      expect(after.kick).toBe(before.kick);
      store.getState().undo();
      expect(store.getState().nodes[0].params).toEqual(before);
    });
  });

  describe("published params", () => {
    const build = () => {
      const subpatch = store.getState().addNode("subpatch", { x: 0, y: 0 });
      store.getState().openSubpatch(subpatch.id);
      const envelope = store.getState().addNode("envelope", { x: 0, y: 0 });
      const filter = store.getState().addNode("filter", { x: 0, y: 0 });
      return { subpatch: subpatch.id, envelope: envelope.id, filter: filter.id };
    };
    const renderSubpatch = () => {
      const node = store.getState().nodes[0];
      return render(
        <PatchStoreContext value={store}>
          <ReactFlowProvider>
            <ModuleNode id={node.id} data={{ type: node.type, params: node.params, patch: node.patch, published: node.published }} />
          </ReactFlowProvider>
        </PatchStoreContext>,
      );
    };

    it("has a button inside a subpatch to publish each knob and select of a node, lit while published", async () => {
      const { envelope } = build();
      renderExisting(envelope);
      const publish = screen.getByRole("button", { name: "Publish D" });
      expect(publish).toHaveAttribute("aria-pressed", "false");
      expect(screen.getByRole("button", { name: "Publish Curve" })).toBeInTheDocument();

      await userEvent.click(publish);

      expect(store.getState().published).toEqual([{ node: envelope, param: "decay" }]);
      cleanup();
      renderExisting(envelope);
      expect(screen.getByRole("button", { name: "Publish D" })).toHaveAttribute("aria-pressed", "true");
    });

    it("has no button to publish outside a subpatch", () => {
      renderNode("envelope");

      expect(screen.queryByRole("button", { name: "Publish D" })).toBeNull();
    });

    it("shows the published params on the subpatch, set there like inside, with an input for those that modulate", () => {
      const { envelope, filter } = build();
      store.getState().togglePublished(envelope, "decay");
      store.getState().togglePublished(envelope, "curve");
      store.getState().togglePublished(filter, "frequency");
      store.getState().closeSubpatch(0);
      const { container } = renderSubpatch();

      const decay = screen.getByRole("slider", { name: "ADSR D" });
      expect(screen.getByRole("combobox", { name: "ADSR Curve" })).toHaveValue("linear");
      expect(container.querySelectorAll(`.react-flow__handle[data-handleid="${filter}.frequency"]`)).toHaveLength(1);
      expect([...container.querySelectorAll(".port-label")].map((label) => label.textContent)).toEqual([]);
      expect(container.querySelector(`.react-flow__handle[data-handleid="${envelope}.decay"]`)).toBeNull();

      fireEvent.keyDown(decay, { key: "ArrowUp" });

      expect(store.getState().nodes[0].patch!.nodes[0].params.decay).toBeGreaterThan(0.3);
    });

    it("hides a published param on the subpatch while it is hidden inside, and shows it again after", () => {
      const subpatch = store.getState().addNode("subpatch", { x: 0, y: 0 });
      store.getState().openSubpatch(subpatch.id);
      const seq = store.getState().addNode("sequencer", { x: 0, y: 0 });
      store.getState().togglePublished(seq.id, "gate");
      store.getState().togglePublished(seq.id, "division");
      store.getState().updateParam(seq.id, "division", "gate", { merge: false });
      store.getState().closeSubpatch(0);

      renderSubpatch();
      expect(screen.queryByRole("slider", { name: "Seq Gate" })).toBeNull();
      expect(screen.getByRole("combobox", { name: "Seq Step" })).toHaveValue("gate");
      cleanup();

      store.getState().updateInnerParam(subpatch.id, seq.id, "division", "1/16");
      renderSubpatch();
      expect(screen.getByRole("slider", { name: "Seq Gate" })).toBeInTheDocument();
    });

    describe("of a subpatch inside a subpatch", () => {
      const nest = () => {
        const { subpatch: inner, envelope } = build();
        store.getState().togglePublished(envelope, "decay");
        store.getState().closeSubpatch(0);
        const outer = store.getState().groupNodes([inner])!.id;
        store.getState().openSubpatch(outer);
        return { outer, inner, envelope };
      };

      it("has a button on the face of the subpatch inside to publish each of its knobs, lit while published", async () => {
        const { inner, envelope } = nest();
        renderExisting(inner);
        const publish = screen.getByRole("button", { name: "Publish ADSR D" });
        expect(publish).toHaveAttribute("aria-pressed", "false");

        await userEvent.click(publish);

        expect(store.getState().published).toEqual([{ node: inner, param: `${envelope}.decay` }]);
        cleanup();
        renderExisting(inner);
        expect(screen.getByRole("button", { name: "Publish ADSR D" })).toHaveAttribute("aria-pressed", "true");
      });

      it("has no button to publish the knobs of a subpatch outside any other", () => {
        build();
        store.getState().closeSubpatch(0);
        renderSubpatch();

        expect(screen.queryByRole("button", { name: "Publish ADSR D" })).toBeNull();
      });

      it("shows the knob on the subpatch outside, named after the subpatch inside, and sets the param at the end", () => {
        const { inner, envelope } = nest();
        store.getState().togglePublished(inner, `${envelope}.decay`);
        store.getState().closeSubpatch(0);
        renderSubpatch();

        fireEvent.keyDown(screen.getByRole("slider", { name: "Subpatch ADSR D" }), { key: "ArrowUp" });

        const decay = store.getState().nodes[0].patch!.nodes.find(({ id }) => id === inner)!.patch!.nodes[0].params.decay;
        expect(decay).toBeGreaterThan(0.3);
      });
    });

    it("renames a published param with a double-click on its name", async () => {
      const { subpatch, envelope } = build();
      store.getState().togglePublished(envelope, "decay");
      store.getState().closeSubpatch(0);
      renderSubpatch();

      await userEvent.dblClick(screen.getByText("ADSR D"));
      const name = screen.getByRole("textbox", { name: "Name of ADSR D" });
      await userEvent.clear(name);
      await userEvent.type(name, "Decay{Enter}");

      expect(store.getState().nodes.find(({ id }) => id === subpatch)!.published).toEqual([
        { node: envelope, param: "decay", name: "Decay" },
      ]);
    });
  });

  describe("published screens", () => {
    const build = () => {
      const subpatch = store.getState().addNode("subpatch", { x: 0, y: 0 });
      store.getState().openSubpatch(subpatch.id);
      const sampler = store.getState().addNode("sampler", { x: 0, y: 0 });
      const clip = store.getState().addNode("clip", { x: 0, y: 0 });
      return { subpatch: subpatch.id, sampler: sampler.id, clip: clip.id };
    };
    const renderFace = (display = displayEngine(), samples = new SampleLibrary()) => {
      const node = store.getState().nodes[0];
      return render(
        <PatchStoreContext value={store}>
          <EngineContext value={display}>
            <SamplesContext value={samples}>
              <ReactFlowProvider>
                <ModuleNode id={node.id} data={{ type: node.type, params: node.params, patch: node.patch, published: node.published }} />
              </ReactFlowProvider>
            </SamplesContext>
          </EngineContext>
        </PatchStoreContext>,
      );
    };

    it("has a button inside a subpatch to publish the sample of a sampler and the notes of a clip", async () => {
      const { sampler, clip } = build();
      renderExisting(sampler);
      renderExisting(clip);

      await userEvent.click(screen.getByRole("button", { name: "Publish Sample" }));
      await userEvent.click(screen.getByRole("button", { name: "Publish Notes" }));

      expect(store.getState().published).toEqual([
        { node: sampler, param: "sample" },
        { node: clip, param: "notes" },
      ]);
    });

    it("has no button to publish a sample or a clip outside a subpatch", () => {
      renderNode("sampler");
      renderNode("clip");

      expect(screen.queryByRole("button", { name: "Publish Sample" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Publish Notes" })).toBeNull();
    });

    it("shows a published sample on the subpatch, as the sampler inside plays it, and loads another one there", async () => {
      const { subpatch, sampler } = build();
      store.getState().togglePublished(sampler, "sample");
      store.getState().closeSubpatch(0);
      const getSample = vi.fn(
        () => ({ samples: [{ status: "ready", name: "kick.wav", buffer: new FakeAudioBuffer(24000, 48000) }], playing: 0 }) as never,
      );

      renderFace(displayEngine({ getSample }));
      expect(screen.getByRole("status", { name: "Sample file" })).toHaveTextContent("kick.wav");
      expect(getSample).toHaveBeenCalledWith(`${subpatch}/${sampler}`);
      expect(screen.queryByRole("button", { name: "Publish Sample" })).toBeNull();

      await userEvent.upload(screen.getByLabelText("Load sample file"), new File([new Uint8Array([3])], "snare.wav", { type: "audio/wav" }));

      await waitFor(() => expect(store.getState().nodes[0].patch!.nodes[0].params.sample).not.toBe(""));
    });

    it("shows a published clip on the subpatch, and opens the piano roll on the clip inside", async () => {
      const { subpatch, clip } = build();
      store.getState().updateParam(clip, "notes", "C4@0+1 G4@2+2", { merge: false });
      store.getState().togglePublished(clip, "notes");
      store.getState().closeSubpatch(0);
      const getPosition = vi.fn();

      renderFace(displayEngine({ getPosition }));
      expect(screen.getByRole("img", { name: "Clip notes" }).querySelectorAll("[data-clip-note]")).toHaveLength(2);
      await waitFor(() => expect(getPosition).toHaveBeenCalledWith(`${subpatch}/${clip}`));

      await userEvent.click(screen.getByRole("button", { name: "Edit" }));

      expect(store.getState().clipEditor).toEqual([subpatch, clip]);
    });
  });

  describe("published grids and patterns", () => {
    const inside = (type: NodeType, params: Record<string, string> = {}) => {
      const subpatch = store.getState().addNode("subpatch", { x: 0, y: 0 });
      store.getState().openSubpatch(subpatch.id);
      const node = store.getState().addNode(type, { x: 0, y: 0 });
      store.getState().updateParams(node.id, params);
      return { subpatch: subpatch.id, node: node.id };
    };
    const innerNode = () => store.getState().toPatch().nodes[0].patch!.nodes[0];
    const renderFace = (display = displayEngine()) => {
      const view = () => {
        const node = store.getState().toPatch().nodes[0];
        return (
          <PatchStoreContext value={store}>
            <EngineContext value={display}>
              <ReactFlowProvider>
                <ModuleNode id={node.id} data={{ type: node.type, params: node.params, patch: node.patch, published: node.published }} />
              </ReactFlowProvider>
            </EngineContext>
          </PatchStoreContext>
        );
      };
      const { rerender } = render(view());
      return () => rerender(view());
    };
    const rows = moduleRegistry.drums.params.filter((param) => param.kind === "rhythm").map(({ id }) => id);

    it("publishes all the rows of a Drums with a single button on them", async () => {
      const { node } = inside("drums");
      renderExisting(node);

      await userEvent.click(screen.getByRole("button", { name: "Publish Rows" }));

      expect(store.getState().published).toEqual(rows.map((param) => ({ node, param })));
      expect(screen.getByRole("button", { name: "Publish Rows" })).toHaveAttribute("aria-pressed", "true");
    });

    it("has a button to publish the steps of a Seq, and the rhythm and the notes of an Arp", () => {
      const { node: seq } = inside("sequencer");
      const arp = store.getState().addNode("arpeggiator", { x: 0, y: 0 }).id;
      store.getState().updateParam(arp, "source", "notes");
      renderExisting(seq);
      renderExisting(arp);

      expect(screen.getByRole("button", { name: "Publish Steps" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Publish Rhythm" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Publish Notes" })).toBeInTheDocument();
    });

    it("draws the rows of a Drums on the subpatch, and switches a step of the Drums inside", () => {
      const { node } = inside("drums");
      store.getState().togglePublished(node, rows);
      store.getState().closeSubpatch(0);
      renderFace();

      const snare = screen.getByRole("group", { name: "Snare" });
      fireEvent.click(within(snare).getByRole("button", { name: "Step 2" }), { detail: 0 });

      expect(String(innerNode().params.snare).split(" ")[1]).toBe("x");
    });

    it("draws the steps of a Seq on the subpatch, with the notes of its scale", () => {
      const { node } = inside("sequencer");
      store.getState().togglePublished(node, "steps");
      store.getState().closeSubpatch(0);
      renderFace();

      expect(screen.getByRole("grid", { name: "Steps" })).toBeInTheDocument();
    });

    it("draws the notes of an Arp on the subpatch only while it plays its own", () => {
      const { subpatch, node } = inside("arpeggiator", { source: "notes" });
      store.getState().togglePublished(node, "notes");
      store.getState().closeSubpatch(0);
      const refresh = renderFace();
      expect(screen.getByRole("group", { name: "Notes to play" })).toBeInTheDocument();

      store.getState().updateInnerParam(subpatch, node, "source", "keys");
      refresh();
      expect(screen.queryByRole("group", { name: "Notes to play" })).toBeNull();
    });

    it("shows the patterns of a node with a published param that makes a pattern, and edits the one chosen", async () => {
      const { node } = inside("sequencer");
      store.getState().togglePublished(node, "steps");
      store.getState().togglePublished(node, "length");
      store.getState().updateParam(node, "length", 8, { merge: false, pattern: "A2" });
      store.getState().closeSubpatch(0);
      const refresh = renderFace();
      const slots = screen.getByRole("group", { name: "Patterns" });

      await userEvent.click(within(slots).getByRole("button", { name: "Pattern A2" }));
      refresh();
      const length = screen.getByRole("slider", { name: "Seq Length" });
      expect(length).toHaveAttribute("aria-valuenow", "8");
      fireEvent.keyDown(length, { key: "ArrowDown" });

      expect(innerNode().patterns?.A2?.length).toBe(7);
      expect(innerNode().params.length).toBe(16);
    });

    it("launches a pattern of the node inside from the subpatch, and writes it into the song with Rec on", async () => {
      const { subpatch, node } = inside("drums");
      store.getState().togglePublished(node, rows);
      store.getState().closeSubpatch(0);
      store.getState().setSongRec(true);
      const display = displayEngine({ launchPattern: vi.fn(), getSongBar: vi.fn(() => undefined) });
      renderFace(display);

      await userEvent.dblClick(within(screen.getByRole("group", { name: "Patterns" })).getByRole("button", { name: "Pattern A3" }));

      expect(vi.mocked(display.launchPattern).mock.calls[0].slice(0, 2)).toEqual([`${subpatch}/${node}`, "A3"]);
      expect(cellAt(store.getState().song!, `${subpatch}/${node}`, 0)).toBe("A3");
    });

    it("edits the rows of the Drums inside as text from the subpatch", async () => {
      const { node } = inside("drums");
      store.getState().togglePublished(node, rows);
      store.getState().closeSubpatch(0);
      renderFace();

      await userEvent.click(screen.getByRole("button", { name: "Edit as text" }));
      const clap = within(screen.getByRole("dialog", { name: "Drums · A1" })).getByRole("textbox", { name: "Clap" });
      await userEvent.clear(clap);
      await userEvent.type(clap, "x{Enter}");

      expect(String(innerNode().params.clap).split(" ").slice(0, 2)).toEqual(["x", "-"]);
    });

    it("shows no patterns for a node whose params published make none", () => {
      const { node } = inside("sequencer");
      store.getState().togglePublished(node, "glide");
      store.getState().closeSubpatch(0);
      renderFace();

      expect(screen.queryByRole("group", { name: "Patterns" })).toBeNull();
    });
  });

  describe("arranging the face", () => {
    const build = () => {
      const subpatch = store.getState().addNode("subpatch", { x: 0, y: 0 });
      store.getState().openSubpatch(subpatch.id);
      const envelope = store.getState().addNode("envelope", { x: 0, y: 0 }).id;
      const seq = store.getState().addNode("sequencer", { x: 0, y: 0 }).id;
      store.getState().togglePublished(envelope, ["attack", "decay"]);
      store.getState().togglePublished(seq, ["glide", "steps"]);
      store.getState().closeSubpatch(0);
      return { subpatch: subpatch.id, envelope, seq };
    };
    const renderFace = () => {
      const view = () => {
        const node = store.getState().nodes[0];
        return (
          <PatchStoreContext value={store}>
            <ReactFlowProvider>
              <ModuleNode id={node.id} data={{ type: node.type, params: node.params, patch: node.patch, published: node.published }} />
            </ReactFlowProvider>
          </PatchStoreContext>
        );
      };
      const { rerender, container } = render(view());
      return { refresh: () => rerender(view()), container };
    };
    const order = () => store.getState().nodes[0].published!.map(({ param, section }) => (section ? `${section}:${param}` : param));
    const before = (first: Element, second: Element) =>
      (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

    it("shows each section under its title, and the patterns of a node before its first control that makes them", () => {
      const { subpatch, envelope } = build();
      store.getState().nameSection(subpatch, `${envelope}.decay`, "Shape");
      const { container } = renderFace();

      const title = screen.getByText("Shape");
      expect(before(screen.getByRole("slider", { name: "ADSR A" }), title)).toBe(true);
      expect(before(title, screen.getByRole("slider", { name: "ADSR D" }))).toBe(true);
      expect(container.querySelectorAll(".face-section")).toHaveLength(1);
      const patterns = screen.getByRole("group", { name: "Patterns" });
      expect(before(screen.getByRole("slider", { name: "Seq Glide" }), patterns)).toBe(true);
      expect(before(patterns, screen.getByRole("grid", { name: "Steps" }))).toBe(true);
    });

    it("moves a control with the arrows on its handle", () => {
      build();
      renderFace();

      fireEvent.keyDown(screen.getByRole("button", { name: "Move ADSR D" }), { key: "ArrowUp" });

      expect(order()).toEqual(["decay", "attack", "glide", "steps"]);
    });

    it("moves a control dragged by its handle onto another", () => {
      build();
      const { container } = renderFace();

      fireEvent.dragStart(screen.getByRole("button", { name: "Move Seq Steps" }));
      fireEvent.drop(container.querySelector(`[data-face-item="${store.getState().nodes[0].published![0].node}.attack"]`)!);

      expect(order()).toEqual(["steps", "attack", "decay", "glide"]);
    });

    it("starts a section at a control from the menu of its handle, and renames it with a double-click on its title", async () => {
      build();
      const { refresh } = renderFace();

      await userEvent.click(screen.getByRole("button", { name: "Move Seq Glide" }));
      await userEvent.click(screen.getByRole("menuitem", { name: "New section here" }));
      expect(order()).toEqual(["attack", "decay", "Section:glide", "Section:steps"]);
      expect(screen.queryByRole("menu")).toBeNull();

      refresh();
      await userEvent.dblClick(screen.getByText("Section"));
      const name = screen.getByRole("textbox", { name: "Name of section Section" });
      await userEvent.clear(name);
      await userEvent.type(name, "Seq{Enter}");

      expect(order()).toEqual(["attack", "decay", "Seq:glide", "Seq:steps"]);
    });
  });

  describe("an In inside a subpatch", () => {
    it("has a Value knob only while it carries control", () => {
      const subpatch = store.getState().addNode("subpatch", { x: 0, y: 0 });
      store.getState().openSubpatch(subpatch.id);
      const inlet = store.getState().addNode("inlet", { x: 0, y: 0 });
      const view = renderExisting(inlet.id);
      expect(screen.queryByRole("slider", { name: "Value" })).toBeNull();
      view.unmount();

      store.getState().updateParam(inlet.id, "signal", "control", { merge: false });
      renderExisting(inlet.id);

      expect(screen.getByRole("slider", { name: "Value" })).toBeInTheDocument();
    });
  });

  describe("harmonics", () => {
    const renderHarmonics = (modulation?: (port: string) => number | undefined) => {
      const { id } = store.getState().addNode("harmonics", { x: 0, y: 0 });
      const node = store.getState().nodes[0];
      const display = displayEngine({ getModulation: vi.fn((_id: string, port: string) => modulation?.(port)) });
      const view = render(
        <PatchStoreContext value={store}>
          <EngineContext value={display}>
            <ReactFlowProvider>
              <ModuleNode id={id} data={{ type: node.type, params: node.params }} />
            </ReactFlowProvider>
          </EngineContext>
        </PatchStoreContext>,
      );
      return view.container;
    };
    const wave = () => screen.getByRole("img", { name: "Wave" }).querySelector("polyline")!.getAttribute("points");

    it("numbers its harmonics under their bars", () => {
      const container = renderHarmonics();

      expect([...container.querySelectorAll(".curve-numbers span")].map((label) => label.textContent)).toEqual(
        Array.from({ length: 16 }, (_, index) => String(index + 1)),
      );
    });

    it("draws the wave it makes, and follows the modulation of its macros", async () => {
      renderHarmonics();
      const still = wave();
      cleanup();
      store = createPatchStore(engine);

      renderHarmonics((port) => (port === "brightness" ? -1 : undefined));

      await waitFor(() => expect(wave()).not.toBe(still));
    });
  });

  describe("custom filter", () => {
    it("draws its response as bars, each with the frequency of its band under it", () => {
      const { container } = renderNode("customFilter");

      expect(container.querySelectorAll(".curve-bar")).toHaveLength(16);
      expect([...container.querySelectorAll(".curve-numbers span")].map((label) => label.textContent)).toEqual([
        "25",
        "39",
        "61",
        "95",
        "149",
        "232",
        "362",
        "566",
        "884",
        "1.4k",
        "2.2k",
        "3.4k",
        "5.3k",
        "8.2k",
        "12.8k",
        "20k",
      ]);
    });

    it("names only every fourth band of the body of a Wind, each name across the four bars it starts", () => {
      const { container } = renderNode("wind");
      const names = [...container.querySelectorAll<HTMLElement>(".curve-numbers span")];

      expect(container.querySelectorAll(".curve-bar")).toHaveLength(32);
      expect(names.map((label) => label.textContent)).toEqual(["100", "176", "310", "545", "960", "1.7k", "3k", "5.2k"]);
      expect(names.map((label) => label.style.gridColumn)).toEqual([
        "1 / span 4",
        "5 / span 4",
        "9 / span 4",
        "13 / span 4",
        "17 / span 4",
        "21 / span 4",
        "25 / span 4",
        "29 / span 4",
      ]);
    });

    it("marks the levels of its response in decibels, each line at its height", () => {
      const { container } = renderNode("customFilter");

      expect(container.querySelector(".curve.curve-marked")).not.toBeNull();
      expect([...container.querySelectorAll(".curve-mark-label")].map((label) => label.textContent)).toEqual([
        "+12 dB",
        "0 dB",
        "-12 dB",
      ]);
      expect([...container.querySelectorAll(".curve-mark")].map((line) => line.getAttribute("y1"))).toEqual([
        "25",
        "50",
        "75",
      ]);
    });

    it("leaves curves without marks bare", () => {
      const { container } = renderNode("harmonics");

      expect(container.querySelector(".curve-marked")).toBeNull();
      expect(container.querySelector(".curve-mark")).toBeNull();
      expect(container.querySelector(".curve-mark-label")).toBeNull();
    });
  });

  describe("clip", () => {
    it("shows its notes small, and opens the piano roll to edit them", async () => {
      const { id } = store.getState().addNode("clip", { x: 0, y: 0 });
      store.getState().updateParam(id, "notes", "C4@0+1 G4@2+2", { merge: false });
      renderExisting(id);

      const preview = screen.getByRole("img", { name: "Clip notes" });
      expect(preview.querySelectorAll("[data-clip-note]")).toHaveLength(2);
      expect(screen.getByRole("slider", { name: "Bars" })).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Edit" }));

      expect(store.getState().clipEditor).toEqual([id]);
    });
  });

  describe("patterns", () => {
    const renderPatterns = (type: NodeType, pattern: PatternState = { playing: "A1" }) => {
      const { id } = store.getState().addNode(type, { x: 0, y: 0 });
      const display = displayEngine({ getPattern: vi.fn(() => pattern), launchPattern: vi.fn() });
      const view = () => {
        const node = store.getState().nodes[0];
        return (
          <PatchStoreContext value={store}>
            <EngineContext value={display}>
              <ReactFlowProvider>
                <ModuleNode id={id} data={{ type, params: node.params, patterns: node.patterns }} />
              </ReactFlowProvider>
            </EngineContext>
          </PatchStoreContext>
        );
      };
      const { rerender } = render(view());
      return { id, display, refresh: () => rerender(view()) };
    };
    const slots = () => screen.queryByRole("group", { name: "Patterns" });
    const slot = (name: string) => within(slots()!).getByRole("button", { name: `Pattern ${name}` });

    it("shows the banks and the patterns of a Seq, editing A1 to start with", () => {
      renderPatterns("sequencer");

      expect(within(slots()!).getAllByRole("button").map((button) => button.textContent)).toEqual([
        "A", "B", "C", "D", "1", "2", "3", "4", "5", "6", "7", "8",
      ]);
      expect(slot("A1")).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("combobox", { name: "Launch" })).toHaveValue("bar");
    });

    it("has patterns on an Arp too, and none on an oscillator", () => {
      renderPatterns("arpeggiator");
      expect(slots()).toBeInTheDocument();
    });

    it("has no patterns on other modules", () => {
      renderPatterns("oscillator");
      expect(slots()).toBeNull();
    });

    it("shows and changes the pattern clicked, leaving the one that plays alone", async () => {
      const { id, refresh } = renderPatterns("sequencer");
      store.getState().updateParam(id, "length", 8, { merge: false, pattern: "A2" });
      refresh();

      await userEvent.click(slot("A2"));
      refresh();
      expect(slot("A2")).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("slider", { name: "Length" })).toHaveAttribute("aria-valuenow", "8");

      await userEvent.selectOptions(screen.getByRole("combobox", { name: "Root" }), "D");

      const node = store.getState().nodes[0];
      expect(node.patterns?.A2?.root).toBe("D");
      expect(node.params.root).toBe("C");
    });

    it("edits the steps of the pattern being edited as text", async () => {
      const { refresh } = renderPatterns("sequencer");

      await userEvent.click(slot("A2"));
      refresh();
      await userEvent.click(screen.getByRole("button", { name: "Edit as text" }));
      const steps = within(screen.getByRole("dialog", { name: "Seq · A2" })).getByRole("textbox", { name: "Steps" });
      await userEvent.clear(steps);
      await userEvent.type(steps, "G4{Enter}");

      const node = store.getState().nodes[0];
      expect(String(node.patterns?.A2?.steps).split(" ")[0]).toBe("G4");
      expect(String(node.params.steps).split(" ")[0]).toBe("C4");
    });

    it("launches the pattern double-clicked", async () => {
      const { id, display } = renderPatterns("sequencer");

      await userEvent.dblClick(slot("A3"));

      expect(display.launchPattern).toHaveBeenCalledWith(id, "A3");
    });

    it("lights the pattern playing and the one waiting", async () => {
      renderPatterns("sequencer", { playing: "A2", queued: "A4" });

      await waitFor(() => expect(slot("A2")).toHaveAttribute("data-playing", "true"));
      expect(slot("A4")).toHaveAttribute("data-queued", "true");
      expect(slot("A1")).not.toHaveAttribute("data-playing");
    });
  });

  describe("curves", () => {
    const renderCurves = (type: NodeType, params: Record<string, string> = {}) => {
      const { id } = store.getState().addNode(type, { x: 0, y: 0 });
      for (const [name, value] of Object.entries(params)) {
        store.getState().updateParam(id, name, value, { merge: false });
      }
      const view = () => (
        <PatchStoreContext value={store}>
          <ReactFlowProvider>
            <ModuleNode id={id} data={{ type, params: store.getState().nodes[0].params }} />
          </ReactFlowProvider>
        </PatchStoreContext>
      );
      const { rerender } = render(view());
      return { refresh: () => rerender(view()) };
    };
    const curve = (name: string) => screen.queryByRole("img", { name });
    const param = (name: string) => String(store.getState().nodes[0].params[name]);
    const draw = (name: string, ...points: [number, number][]) => {
      const editor = curve(name)!;
      vi.spyOn(editor, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 64, height: 20 } as DOMRect);
      const [[clientX, clientY], ...rest] = points;
      fireEvent.pointerDown(editor, { clientX, clientY, pointerId: 1, buttons: 1 });
      for (const [x, y] of rest) {
        fireEvent.pointerMove(editor, { clientX: x, clientY: y, pointerId: 1, buttons: 1 });
      }
      fireEvent.pointerUp(editor, { pointerId: 1 });
    };

    beforeEach(() => {
      Element.prototype.setPointerCapture ??= () => {};
    });

    it("shows the shape of an oscillator only while it plays a drawn wave, and its harmonics only while it plays them", () => {
      const { refresh } = renderCurves("oscillator");
      expect(curve("Shape")).toBeNull();
      expect(curve("Harmonics")).toBeNull();

      store.getState().updateParam("oscillator-1", "waveform", "drawn", { merge: false });
      refresh();
      expect(curve("Shape")).toBeInTheDocument();
      expect(curve("Harmonics")).toBeNull();

      store.getState().updateParam("oscillator-1", "waveform", "harmonics", { merge: false });
      refresh();
      expect(curve("Shape")).toBeNull();
      expect(curve("Harmonics")).toBeInTheDocument();
    });

    it("draws the shape with a straight line between the points the pointer went through, as one undo step", () => {
      renderCurves("oscillator", { waveform: "drawn" });
      const before = param("shape");

      draw("Shape", [0, 0], [3, 20]);

      expect(param("shape").startsWith("1 0.33 -0.33 -1 0.38 ")).toBe(true);
      store.getState().undo();
      expect(param("shape")).toBe(before);
    });

    it("sets the curve back to its default when its name is double-clicked", async () => {
      renderCurves("oscillator", { waveform: "harmonics" });
      const before = param("harmonics");
      draw("Harmonics", [0, 20]);
      expect(param("harmonics")).not.toBe(before);

      await userEvent.dblClick(screen.getByText("Harmonics"));

      expect(param("harmonics")).toBe(before);
    });

    it("draws the response of a custom filter, with no knobs", () => {
      renderCurves("customFilter");

      expect(curve("Response")).toBeInTheDocument();
      expect(screen.queryByRole("slider")).toBeNull();
    });
  });

  describe("mixer", () => {
    const renderMixer = () => {
      store.getState().addNode("oscillator", { x: 0, y: 0 });
      store.getState().addNode("noise", { x: 0, y: 0 });
      const mixer = store.getState().addNode("mixer", { x: 0, y: 0 });
      const view = () => (
        <PatchStoreContext value={store}>
          <EngineContext value={displayEngine()}>
            <ReactFlowProvider>
              <ModuleNode id={mixer.id} data={{ type: mixer.type, params: store.getState().nodes[2].params }} />
            </ReactFlowProvider>
          </EngineContext>
        </PatchStoreContext>
      );
      const { rerender } = render(view());
      return { refresh: () => rerender(view()) };
    };
    const plug = (source: string) =>
      store.getState().connect({ nodeId: source, port: "audio" }, { nodeId: "mixer-3", port: "audio" })!;
    const cable = (id: string) => store.getState().connections.find((connection) => connection.id === id)!;

    it("asks for cables while it has none, and has a Level knob of its own", () => {
      renderMixer();

      expect(screen.getByText("Connect sounds to mix them")).toBeInTheDocument();
      expect(screen.getByRole("slider", { name: "Level" })).toBeInTheDocument();
    });

    it("shows a channel per cable, named after its source, with a level, a meter, mute and solo", () => {
      const { refresh } = renderMixer();
      plug("oscillator-1");
      plug("noise-2");
      refresh();

      const channels = within(screen.getByRole("list", { name: "Channels" })).getAllByRole("listitem");
      expect(channels.map((channel) => channel.querySelector(".mixer-channel-label")!.textContent)).toEqual([
        "Oscillator 1",
        "Noise 2",
      ]);
      expect(screen.getByRole("slider", { name: "Oscillator 1 level" })).toHaveAttribute("aria-valuetext", "1.00");
      expect(screen.getByRole("meter", { name: "Oscillator 1 signal" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Mute Oscillator 1" })).toHaveAttribute("aria-pressed", "false");
      expect(screen.getByRole("button", { name: "Solo Noise 2" })).toHaveAttribute("aria-pressed", "false");
    });

    it("makes no channel of a cable that modulates its Level", () => {
      const { refresh } = renderMixer();
      plug("oscillator-1");
      const lfo = store.getState().addNode("lfo", { x: 0, y: 0 });
      store.getState().connect({ nodeId: lfo.id, port: "out" }, { nodeId: "mixer-3", port: "level" });
      refresh();

      const channels = within(screen.getByRole("list", { name: "Channels" })).getAllByRole("listitem");
      expect(channels.map((channel) => channel.querySelector(".mixer-channel-label")!.textContent)).toEqual([
        "Oscillator 1",
      ]);
    });

    it("pans each channel from the centre, keeping its pan on its cable", () => {
      const { refresh } = renderMixer();
      const { id } = plug("oscillator-1");
      refresh();
      const pan = screen.getByRole("slider", { name: "Oscillator 1 pan" });
      expect(pan).toHaveAttribute("aria-valuetext", "C");

      fireEvent.keyDown(pan, { key: "ArrowLeft", shiftKey: true });
      refresh();

      expect(cable(id).pan).toBe(-0.1);
      expect(screen.getByRole("slider", { name: "Oscillator 1 pan" })).toHaveAttribute("aria-valuetext", "L10");
    });

    it("keeps the level of each channel on its cable", () => {
      const { refresh } = renderMixer();
      const { id } = plug("oscillator-1");
      refresh();

      fireEvent.keyDown(screen.getByRole("slider", { name: "Oscillator 1 level" }), { key: "ArrowDown" });

      expect(cable(id).amount).toBe(0.99);
    });

    it("mutes and solos a channel on its cable, each click one undo step", async () => {
      const { refresh } = renderMixer();
      const { id } = plug("oscillator-1");
      refresh();

      await userEvent.click(screen.getByRole("button", { name: "Mute Oscillator 1" }));
      refresh();
      await userEvent.click(screen.getByRole("button", { name: "Solo Oscillator 1" }));
      refresh();

      expect(cable(id)).toMatchObject({ mute: true, solo: true });
      expect(screen.getByRole("button", { name: "Mute Oscillator 1" })).toHaveAttribute("aria-pressed", "true");

      store.getState().undo();
      expect(cable(id).solo).toBeUndefined();
      expect(cable(id).mute).toBe(true);
    });
  });

  describe("keys", () => {
    const renderKeys = (keys: Partial<KeysState> = {}, transpose = 0, playing?: number) => {
      const node = store.getState().addNode("keyboard", { x: 0, y: 0 });
      node.params.transpose = transpose;
      const state: KeysState = {
        octave: 0,
        up: false,
        held: new Map(),
        changeOctave: vi.fn(),
        press: vi.fn(),
        release: vi.fn(),
        ...keys,
      };
      const display = displayEngine({ getNotes: () => (playing === undefined ? undefined : { notes: [], playing }) });
      render(
        <PatchStoreContext value={store}>
          <EngineContext value={display}>
            <KeysContext value={state}>
              <ReactFlowProvider>
                <ModuleNode id={node.id} data={{ type: node.type, params: node.params }} />
              </ReactFlowProvider>
            </KeysContext>
          </EngineContext>
        </PatchStoreContext>,
      );
      return state;
    };

    it("shows the notes the computer keys play, following their octave", () => {
      renderKeys({ octave: -2 });

      expect(screen.getByRole("status", { name: "Keys" })).toHaveTextContent("C2–C3");
    });

    it("shows the notes that come out of the node, with its transpose", () => {
      renderKeys({ octave: 1 }, 7);

      expect(screen.getByRole("status", { name: "Keys" })).toHaveTextContent("G5–G6");
    });

    it("presses the key that started the note sounding, even an octave up with Shift", async () => {
      renderKeys({ held: new Map([["a", 60], ["s", 74]]) }, 0, 74);

      await waitFor(() =>
        expect([...document.querySelectorAll(".piano-key[data-playing]")].map((key) => key.textContent)).toEqual([
          "S",
        ]),
      );
    });

    it("draws the keys as a piano with their letters, lit while down", () => {
      renderKeys({ held: new Map([["a", 60], ["w", 61]]) });

      const piano = screen.getByRole("group", { name: /Computer keys/ });
      expect(piano.querySelectorAll(".piano-white")).toHaveLength(8);
      expect(piano.querySelectorAll(".piano-black")).toHaveLength(5);
      expect([...piano.querySelectorAll("[data-held]")].map((key) => key.textContent)).toEqual(["A", "W"]);
    });

    it("moves the octave from its buttons", async () => {
      const { changeOctave } = renderKeys();

      await userEvent.click(screen.getByRole("button", { name: "Octave down" }));
      await userEvent.click(screen.getByRole("button", { name: "Octave up" }));

      expect(vi.mocked(changeOctave).mock.calls).toEqual([[-1], [1]]);
    });

    it("lights UP while the keys play one octave up", () => {
      renderKeys({ up: true });

      expect(screen.getByText("Up")).toHaveAttribute("data-on", "true");
    });

    it("shows them on the arpeggiator too, but not on other modules", () => {
      renderNode("arpeggiator");
      renderNode("filter");

      expect(screen.getAllByRole("status", { name: "Keys" })).toHaveLength(1);
    });
  });

  it.each(["sequencer", "arpeggiator", "drums"] as const)("hides the Gate of the %s while gates mark its steps", (type) => {
    const { id } = store.getState().addNode(type, { x: 0, y: 0 });
    const draw = () => {
      const node = store.getState().nodes[0];
      return <ModuleNode id={id} data={{ type: node.type, params: node.params }} />;
    };
    const view = render(
      <PatchStoreContext value={store}>
        <ReactFlowProvider>{draw()}</ReactFlowProvider>
      </PatchStoreContext>,
    );
    expect(screen.getByRole("slider", { name: "Gate" })).toBeInTheDocument();

    store.getState().updateParam(id, "division", "gate", { merge: false });
    view.rerender(
      <PatchStoreContext value={store}>
        <ReactFlowProvider>{draw()}</ReactFlowProvider>
      </PatchStoreContext>,
    );

    expect(screen.queryByRole("slider", { name: "Gate" })).toBeNull();
  });

  it("shows the module title and one control per param", () => {
    renderNode();

    expect(screen.getByText("Filter")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Type" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Freq" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Q" })).toBeInTheDocument();
  });

  it("updates the param through the store", () => {
    renderNode();

    fireEvent.change(screen.getByRole("combobox", { name: "Type" }), {
      target: { value: "highpass" },
    });

    expect(store.getState().nodes[0].params.type).toBe("highpass");
    expect(vi.mocked(engine.sync).mock.lastCall?.[0].nodes[0].params.type).toBe("highpass");
  });

  it("removes itself", async () => {
    renderNode();

    await userEvent.click(screen.getByRole("button", { name: "Remove Filter" }));

    expect(store.getState().nodes).toEqual([]);
    expect(vi.mocked(engine.sync).mock.lastCall?.[0]).toEqual({ nodes: [], connections: [], tempo: 120 });
  });

  it("labels its audio ports", () => {
    renderNode();

    expect(screen.getByText("audio in")).toBeInTheDocument();
    expect(screen.getByText("audio out")).toBeInTheDocument();
  });

  it("offers a control input next to every modulatable param", () => {
    const { container } = renderNode();

    const controls = container.querySelectorAll(".react-flow__handle.target.port-control");
    expect([...controls].map((handle) => handle.getAttribute("data-handleid"))).toEqual([
      "frequency",
      "Q",
    ]);
  });

  it("labels the keyboard outputs and how to play it", () => {
    const { container } = renderNode("keyboard");

    expect(screen.getByText("pitch out")).toBeInTheDocument();
    expect(screen.getByText("gate out")).toBeInTheDocument();
    expect(container.querySelector(".port-trigger.source")).not.toBeNull();
    expect(screen.getByRole("group", { name: "Computer keys: A W S E D F T G Y H U J K" })).toBeInTheDocument();
  });

  it("labels the envelope gate input", () => {
    renderNode("envelope");

    expect(screen.getByText("gate in")).toBeInTheDocument();
  });

  it("labels the outputs of a clock with its divisions, or with how it divides the gates coming in", () => {
    const keys = store.getState().addNode("keyboard", { x: 0, y: 0 });
    const clock = store.getState().addNode("clock", { x: 300, y: 0 });
    const labels = (container: HTMLElement) =>
      [...container.querySelectorAll(".port-label-out")].map((label) => label.textContent);

    const { container, unmount } = renderExisting(clock.id);
    expect(labels(container)).toEqual(["bar out", "1/2 out", "1/4 out", "1/8 out", "1/16 out", "1/32 out"]);
    unmount();

    store.getState().connect({ nodeId: keys.id, port: "gate" }, { nodeId: clock.id, port: "gate" });
    const fed = renderExisting(clock.id);
    expect(labels(fed.container)).toEqual(["÷16 out", "÷8 out", "÷4 out", "÷3 out", "÷2 out", "÷1 out"]);
  });

  describe("name", () => {
    it("renames the node by double-clicking its title", async () => {
      const { id } = store.getState().addNode("gain", { x: 0, y: 0 });
      const { rerender } = renderExisting(id);

      await userEvent.dblClick(screen.getByText("Gain", { selector: ".module-title" }));
      await userEvent.type(screen.getByRole("textbox", { name: "Name" }), "VCA{Enter}");

      expect(store.getState().nodes[0].name).toBe("VCA");
      rerender(
        <PatchStoreContext value={store}>
          <ReactFlowProvider>
            <ModuleNode id={id} data={{ type: "gain", name: "VCA", params: store.getState().nodes[0].params }} />
          </ReactFlowProvider>
        </PatchStoreContext>,
      );
      expect(screen.getByText("VCA", { selector: ".module-name" })).toBeInTheDocument();
      expect(screen.getByText("Gain", { selector: ".module-type" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Remove VCA" })).toBeInTheDocument();
    });

    it("keeps the name on Escape", async () => {
      renderNode("gain");

      await userEvent.dblClick(screen.getByText("Gain", { selector: ".module-title" }));
      await userEvent.type(screen.getByRole("textbox", { name: "Name" }), "VCA{Escape}");

      expect(store.getState().nodes[0]).not.toHaveProperty("name");
      expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull();
    });

    it("saves the name when the field loses focus", async () => {
      renderNode("gain");

      await userEvent.dblClick(screen.getByText("Gain", { selector: ".module-title" }));
      await userEvent.type(screen.getByRole("textbox", { name: "Name" }), "VCA");
      await userEvent.click(document.body);

      expect(store.getState().nodes[0].name).toBe("VCA");
    });

    it("starts editing from the current name", async () => {
      const { id } = store.getState().addNode("gain", { x: 0, y: 0 });
      store.getState().renameNode(id, "VCA");
      renderExisting(id);

      await userEvent.dblClick(screen.getByText("VCA"));

      expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("VCA");
    });
  });

  it("shows the scope display with an audio and a control input", () => {
    const { container } = renderNode("scope");

    expect(screen.getByRole("img", { name: "Waveform" })).toBeInTheDocument();
    expect(screen.getByText("audio in")).toBeInTheDocument();
    expect(screen.getByText("control in")).toBeInTheDocument();
    expect(container.querySelector('.react-flow__handle.port-control[data-handleid="control"]')).not.toBeNull();
    expect(screen.getByRole("slider", { name: "Time" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Range" })).toBeInTheDocument();
  });

  it("labels the scope edges with the range", () => {
    const { id } = store.getState().addNode("scope", { x: 0, y: 0 });
    store.getState().updateParam(id, "range", 0.09);
    renderExisting(id);

    expect(screen.getByText("+0.09")).toBeInTheDocument();
    expect(screen.getByText("−0.09")).toBeInTheDocument();
    expect(screen.getByText("Connect signals to see them")).toBeInTheDocument();
  });

  describe("the traces of a scope", () => {
    const wobbling = () => {
      store.getState().addNode("oscillator", { x: 0, y: 0 });
      const lfo = store.getState().addNode("lfo", { x: 0, y: 0 });
      const scope = store.getState().addNode("scope", { x: 0, y: 0 });
      store.getState().renameNode(lfo.id, "Wobble");
      store.getState().connect({ nodeId: "oscillator-1", port: "audio" }, { nodeId: scope.id, port: "audio" });
      store.getState().connect({ nodeId: lfo.id, port: "out" }, { nodeId: scope.id, port: "control" });
      return { scope: scope.id, wobble: `${lfo.id}:out->${scope.id}:control` };
    };
    const trigger = (id: string) => store.getState().nodes.find((node) => node.id === id)!.params.trigger;

    it("lists one per connection, and holds still on the first one", () => {
      renderExisting(wobbling().scope);

      expect(screen.getByRole("button", { name: /Oscillator 1/ })).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("button", { name: /Wobble/ })).toHaveAttribute("aria-pressed", "false");
      expect(screen.getByRole("status", { name: "Wobble peak" })).toHaveTextContent("0.00");
    });

    it("keeps the one clicked in the patch, as one undo step", async () => {
      const { scope, wobble } = wobbling();
      renderExisting(scope);

      await userEvent.click(screen.getByRole("button", { name: /Wobble/ }));

      expect(trigger(scope)).toBe(wobble);
      store.getState().undo();
      expect(trigger(scope)).toBe("");
    });

    it("holds still on the one the patch names", () => {
      const { scope, wobble } = wobbling();
      store.getState().updateParam(scope, "trigger", wobble, { merge: false });

      renderExisting(scope);

      expect(screen.getByRole("button", { name: /Wobble/ })).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("button", { name: /Oscillator 1/ })).toHaveAttribute("aria-pressed", "false");
    });

    it("falls back to the first one when the cable it names is gone", () => {
      const { scope, wobble } = wobbling();
      store.getState().updateParam(scope, "trigger", wobble, { merge: false });
      store.getState().disconnect(wobble);

      renderExisting(scope);

      expect(screen.getByRole("button", { name: /Oscillator 1/ })).toHaveAttribute("aria-pressed", "true");
    });
  });

  it("shows the output volume and level meter", () => {
    renderNode("output");

    expect(screen.getByRole("slider", { name: "Volume" })).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "Output level" })).toBeInTheDocument();
    expect(screen.getByText("CLIP")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Limiter" })).toHaveValue("on");
  });

  describe("an output that went quiet", () => {
    const renderOutput = (muted: () => boolean, unmuteOutput = vi.fn()) => {
      const node = store.getState().addNode("output", { x: 0, y: 0 });
      const display = displayEngine({ isOutputMuted: vi.fn(() => muted()), unmuteOutput });
      render(
        <PatchStoreContext value={store}>
          <EngineContext value={display}>
            <ReactFlowProvider>
              <ModuleNode id={node.id} data={{ type: node.type, params: node.params }} />
            </ReactFlowProvider>
          </EngineContext>
        </PatchStoreContext>,
      );
      return node.id;
    };

    it("says nothing while it sounds", () => {
      renderOutput(() => false);

      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.queryByRole("button", { name: "Unmute" })).toBeNull();
    });

    it("says why it went quiet, and unmutes it", async () => {
      let muted = false;
      const unmuteOutput = vi.fn(() => {
        muted = false;
      });
      const id = renderOutput(() => muted, unmuteOutput);

      muted = true;
      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Muted: the sound got far too loud"));

      await userEvent.click(screen.getByRole("button", { name: "Unmute" }));

      expect(unmuteOutput).toHaveBeenCalledWith(id);
      expect(screen.queryByRole("alert")).toBeNull();
    });
  });

  describe("arpeggiator notes", () => {
    const renderArp = (activity: NoteActivity | undefined, params: Record<string, string | number> = {}) => {
      const { id } = store.getState().addNode("arpeggiator", { x: 0, y: 0 });
      for (const [name, value] of Object.entries(params)) {
        store.getState().updateParam(id, name, value, { merge: false });
      }
      const display = displayEngine({ getNotes: () => activity });
      render(
        <PatchStoreContext value={store}>
          <EngineContext value={display}>
            <ReactFlowProvider>
              <ModuleNode id={id} data={{ type: "arpeggiator", params: store.getState().nodes[0].params }} />
            </ReactFlowProvider>
          </EngineContext>
        </PatchStoreContext>,
      );
    };
    const sounding = () => document.querySelectorAll(".piano-key[data-playing]");

    it("marks the note sounding on the key that plays it, without listing the notes", async () => {
      renderArp({ notes: [60, 64], playing: 64 });

      await waitFor(() => expect(sounding()).toHaveLength(1));
      expect(sounding()[0]).toHaveTextContent("D");
      expect(screen.getByRole("group", { name: /Computer keys/ })).toHaveAttribute("data-playing", "E4");
      expect(screen.queryByRole("list")).toBeNull();
    });

    it("marks a note beyond its piano on the key of the same name", async () => {
      renderArp({ notes: [60, 76], playing: 76 }, { source: "notes" });

      await waitFor(() => expect(sounding()).toHaveLength(1));
      expect(sounding()[0]).toHaveTextContent("E");
    });

    it("marks nothing while no note sounds", async () => {
      renderArp({ notes: [] });

      await new Promise((resolve) => requestAnimationFrame(resolve));
      expect(sounding()).toHaveLength(0);
    });

    it("moves its own notes an octave from the switch under their piano", async () => {
      renderArp(undefined, { source: "notes" });
      expect(screen.getByRole("status", { name: "Keys" })).toHaveTextContent("C4–C5");
      expect(screen.queryByRole("slider", { name: "Octave" })).toBeNull();

      await userEvent.click(screen.getByRole("button", { name: "Octave down" }));

      expect(store.getState().nodes[0].params.octave).toBe(-1);
    });
  });

  describe("sequencer grid", () => {
    const renderSeq = (position?: number, scale = "chromatic", keyTranspose?: number) => {
      const node = store.getState().addNode("sequencer", { x: 0, y: 0 });
      store.getState().updateParam(node.id, "steps", "C4 - E4 - - - - - - - - - - - - -");
      store.getState().updateParam(node.id, "scale", scale);
      const display = displayEngine({ getPosition: () => position, getKeyTranspose: () => keyTranspose });
      const view = () => (
        <PatchStoreContext value={store}>
          <EngineContext value={display}>
            <ReactFlowProvider>
              <ModuleNode id={node.id} data={{ type: node.type, params: store.getState().nodes[0].params }} />
            </ReactFlowProvider>
          </EngineContext>
        </PatchStoreContext>
      );
      const { rerender } = render(view());
      return { id: node.id, refresh: () => rerender(view()) };
    };
    const cell = (step: number, note: string) => screen.getByRole("gridcell", { name: `Step ${step} ${note}` });
    const steps = () => store.getState().nodes[0].params.steps;

    it("shows a cell per step and note, with the notes of the pattern on", () => {
      renderSeq();

      expect(screen.getAllByRole("row")).toHaveLength(13);
      expect(screen.getAllByRole("gridcell")).toHaveLength(13 * 16);
      expect(cell(1, "C4")).toHaveAttribute("aria-pressed", "true");
      expect(cell(3, "E4")).toHaveAttribute("aria-pressed", "true");
      expect(cell(2, "C4")).toHaveAttribute("aria-pressed", "false");
      expect(screen.queryByRole("slider", { name: "Steps" })).toBeNull();
    });

    it("places, moves and removes notes, each click one undo step", async () => {
      const { refresh } = renderSeq();

      await userEvent.click(cell(2, "G4"));
      expect(steps()).toBe("C4 G4 E4 - - - - - - - - - - - - -");
      refresh();

      await userEvent.click(cell(1, "D4"));
      expect(steps()).toBe("D4 G4 E4 - - - - - - - - - - - - -");
      refresh();

      await userEvent.click(cell(3, "E4"));
      expect(steps()).toBe("D4 G4 - - - - - - - - - - - - - -");

      store.getState().undo();
      expect(steps()).toBe("D4 G4 E4 - - - - - - - - - - - - -");
    });

    const drag = (cells: HTMLElement[]) =>
      userEvent.pointer([
        { keys: "[MouseLeft>]", target: cells[0] },
        ...cells.slice(1).map((target) => ({ target })),
        { keys: "[/MouseLeft]" },
      ]);

    it("fills the steps it is dragged across, all as one undo step", async () => {
      renderSeq();

      await drag([cell(5, "G4"), cell(6, "G4"), cell(7, "G4")]);

      expect(steps()).toBe("C4 - E4 - G4 G4 G4 - - - - - - - - -");
      store.getState().undo();
      expect(steps()).toBe("C4 - E4 - - - - - - - - - - - - -");
    });

    it("clears the steps it is dragged across when it starts on a note", async () => {
      const { id, refresh } = renderSeq();
      store.getState().updateParam(id, "steps", "C4 C4 C4 C4 - - - - - - - - - - - -", { merge: false });
      refresh();

      await drag([cell(2, "C4"), cell(3, "C4")]);

      expect(steps()).toBe("C4 - - C4 - - - - - - - - - - - -");
    });

    it("leaves the notes of other rows alone while it clears", async () => {
      renderSeq();

      // Starts on the C4 of step 1, so it clears; the E4 of step 3 is a different row.
      await drag([cell(1, "C4"), cell(2, "C4"), cell(3, "C4")]);

      expect(steps()).toBe("- - E4 - - - - - - - - - - - - -");
    });

    const rowNames = () => screen.getAllByRole("rowheader").map((header) => header.textContent);

    it("shows only the notes of the scale, over two octaves from the root", () => {
      const { id, refresh } = renderSeq(undefined, "pentatonic major");
      store.getState().updateParam(id, "root", "D");
      store.getState().updateParam(id, "steps", "D4 - - - - - - - - - - - - - - -");
      refresh();

      expect(rowNames()).toEqual(["D6", "B5", "A5", "F#5", "E5", "D5", "B4", "A4", "F#4", "E4", "D4"]);
      const roots = screen.getAllByRole("row").filter((row) => row.classList.contains("step-row-root"));
      expect(roots.map((row) => row.querySelector('[role="rowheader"]')!.textContent)).toEqual(["D6", "D5", "D4"]);
      expect(screen.getAllByRole("row").some((row) => row.classList.contains("step-row-black"))).toBe(false);
    });

    it("keeps and marks notes placed outside the scale", () => {
      // E4 is not in C minor pentatonic, the default scale.
      renderSeq(undefined, "pentatonic minor");

      const outside = screen.getAllByRole("row").filter((row) => row.classList.contains("step-row-outside"));
      expect(outside.map((row) => row.querySelector('[role="rowheader"]')!.textContent)).toEqual(["E4"]);
      expect(cell(3, "E4")).toHaveAttribute("aria-pressed", "true");
    });

    it("labels the rows with the notes that sound after the octave shift", () => {
      const { id, refresh } = renderSeq();
      store.getState().updateParam(id, "octave", -1);
      refresh();

      expect(screen.getAllByRole("rowheader").map((header) => header.textContent)).toEqual([
        "C4", "B3", "A#3", "A3", "G#3", "G3", "F#3", "F3", "E3", "D#3", "D3", "C#3", "C3",
      ]);
      expect(cell(1, "C3")).toHaveAttribute("aria-pressed", "true");
    });

    it("labels the rows with the notes that sound once the keys transpose the pattern", async () => {
      renderSeq(undefined, "chromatic", 2);

      await waitFor(() =>
        expect(screen.getAllByRole("rowheader").map((header) => header.textContent)).toEqual([
          "D5", "C#5", "C5", "B4", "A#4", "A4", "G#4", "G4", "F#4", "F4", "E4", "D#4", "D4",
        ]),
      );
      // The cells keep the notes of the pattern.
      expect(cell(1, "C4")).toHaveAttribute("aria-pressed", "true");
    });

    it("dims the steps past the length and lights the one playing", async () => {
      const { id, refresh } = renderSeq(2);
      store.getState().updateParam(id, "length", 8);
      refresh();

      await waitFor(() => expect(cell(3, "C4")).toHaveClass("step-cell-playing"));
      expect(cell(8, "C4")).not.toHaveClass("step-cell-off");
      expect(cell(9, "C4")).toHaveClass("step-cell-off");
    });
  });

  it("shows no display on other modules", () => {
    renderNode("filter");

    expect(screen.queryByRole("img", { name: "Waveform" })).toBeNull();
    expect(screen.queryByRole("meter")).toBeNull();
  });

  it("switches the oscillator to keyboard mode", () => {
    renderNode("oscillator");

    fireEvent.change(screen.getByRole("combobox", { name: "Mode" }), {
      target: { value: "keyboard" },
    });

    expect(store.getState().nodes[0].params.mode).toBe("keyboard");
  });

  it("renders the oscillator Freq disabled when already in keyboard mode", () => {
    const node = store.getState().addNode("oscillator", { x: 0, y: 0 });
    render(
      <PatchStoreContext value={store}>
        <ReactFlowProvider>
          <ModuleNode id={node.id} data={{ type: "oscillator", params: { ...node.params, mode: "keyboard" } }} />
        </ReactFlowProvider>
      </PatchStoreContext>,
    );

    expect(screen.getByRole("slider", { name: "Freq" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("C4")).toBeInTheDocument();
    expect(screen.queryByText("440 Hz")).toBeNull();
  });

  it("shows the oscillator Freq in free mode", () => {
    renderNode("oscillator");

    expect(screen.getByRole("slider", { name: "Freq" })).toBeEnabled();
    expect(screen.getByText("440 Hz")).toBeInTheDocument();
  });

  describe("modulation hint", () => {
    const hint = /Set to 0 so the modulation can fully close it/;

    const modulatedGain = () => {
      store.getState().addNode("envelope", { x: 0, y: 0 });
      const gain = store.getState().addNode("gain", { x: 0, y: 0 });
      store.getState().connect({ nodeId: "envelope-1", port: "out" }, { nodeId: gain.id, port: "gain" });
      return gain.id;
    };

    it("warns when a modulated gain is not at zero", () => {
      renderExisting(modulatedGain());

      expect(screen.getByText(hint)).toBeInTheDocument();
    });

    it("does not warn when the modulated gain is at zero", () => {
      const id = modulatedGain();
      store.getState().updateParam(id, "gain", 0);

      renderExisting(id);

      expect(screen.queryByText(hint)).toBeNull();
    });

    it("does not warn without modulation", () => {
      renderNode("gain");

      expect(screen.queryByText(hint)).toBeNull();
    });

    it("does not warn for audio going into the gain", () => {
      store.getState().addNode("oscillator", { x: 0, y: 0 });
      const gain = store.getState().addNode("gain", { x: 0, y: 0 });
      store.getState().connect({ nodeId: "oscillator-1", port: "audio" }, { nodeId: gain.id, port: "audio" });

      renderExisting(gain.id);

      expect(screen.queryByText(hint)).toBeNull();
    });
  });

  describe("two note sources on one param", () => {
    const warning = /Two pitch sources add up/;

    const oscillatorFrom = (...sources: NodeType[]) => {
      const oscillator = store.getState().addNode("oscillator", { x: 0, y: 0 });
      for (const type of sources) {
        const source = store.getState().addNode(type, { x: 0, y: 0 });
        store.getState().connect({ nodeId: source.id, port: "pitch" }, { nodeId: oscillator.id, port: "frequency" });
      }
      return oscillator.id;
    };

    it("warns when a keyboard and a sequencer reach the same frequency", () => {
      renderExisting(oscillatorFrom("keyboard", "sequencer"));

      expect(screen.getByText(warning)).toBeInTheDocument();
    });

    it("does not warn for a single note source", () => {
      renderExisting(oscillatorFrom("keyboard"));

      expect(screen.queryByText(warning)).toBeNull();
    });

    it("does not warn when the second source is not a note", () => {
      const id = oscillatorFrom("keyboard");
      const lfo = store.getState().addNode("lfo", { x: 0, y: 0 });
      store.getState().connect({ nodeId: lfo.id, port: "out" }, { nodeId: id, port: "frequency" });

      renderExisting(id);

      expect(screen.queryByText(warning)).toBeNull();
    });
  });
});

describe("ModuleNode with patterns", () => {
  it("stacks the patterns, the knobs, the selects and what it plays, in that order", () => {
    const { container } = renderNode("sequencer");
    const order = [".patterns", ".module-knobs", ".module-selects", ".step-grid"].map((selector) =>
      container.querySelector(selector),
    );

    expect(order.every(Boolean)).toBe(true);
    order.slice(1).forEach((element, index) =>
      expect(order[index]!.compareDocumentPosition(element!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(),
    );
  });

  it("puts the knobs in a row, and the selects under them", () => {
    const { container } = renderNode("sequencer");
    const knobs = container.querySelector<HTMLElement>(".module-knobs")!;
    const selects = container.querySelector<HTMLElement>(".module-selects")!;

    expect(within(knobs).getAllByRole("slider").map((knob) => knob.getAttribute("aria-label"))).toEqual([
      "Length",
      "Gate",
      "Glide",
      "Octave",
    ]);
    expect(within(selects).getAllByRole("combobox").map((select) => select.getAttribute("aria-label"))).toEqual([
      "Step",
      "Root",
      "Scale",
      "Chord",
      "Keys",
    ]);
  });

  it("keeps a module without patterns with a row for each param", () => {
    const { container } = renderNode("oscillator");

    expect(container.querySelector(".module-knobs")).toBeNull();
  });
});

describe("ModuleNode in a song", () => {
  let position: number | undefined;
  let song: SongControl;

  beforeEach(() => {
    Element.prototype.setPointerCapture ??= () => {};
    position = 4;
    const songEngine: RecorderEngine & SongControl["engine"] = {
      getSongPosition: () => position,
      getControl: () => undefined,
      holdControl: vi.fn(),
      setControl: vi.fn(),
      releaseControl: vi.fn(),
      state: "running",
      subscribe: () => () => {},
    };
    song = { engine: songEngine, store, recorder: new SongRecorder(songEngine, store) };
    store.getState().setSongMode(true);
    store.getState().setSongRec(true);
  });

  const renderInSong = (id: string) => {
    const node = store.getState().nodes.find((candidate) => candidate.id === id)!;
    return render(
      <PatchStoreContext value={store}>
        <SongControlContext value={song}>
          <ReactFlowProvider>
            <ModuleNode id={node.id} data={{ type: node.type, name: node.name, params: node.params, patch: node.patch, published: node.published }} />
          </ReactFlowProvider>
        </SongControlContext>
      </PatchStoreContext>,
    );
  };

  const drag = (knob: HTMLElement) => {
    fireEvent.pointerDown(knob, { clientY: 200, pointerId: 1 });
    position = 5;
    fireEvent.pointerMove(knob, { clientY: 160, pointerId: 1 });
    fireEvent.pointerUp(knob, { pointerId: 1 });
  };

  const lanes = () => store.getState().song?.automation ?? {};

  it("records a knob dragged with Rec into the song, leaving the patch as it was", () => {
    const { id } = store.getState().addNode("oscillator", { x: 0, y: 0 });
    renderInSong(id);

    drag(screen.getByRole("slider", { name: "Detune" }));

    expect(Object.keys(lanes())).toEqual([`${id}.detune`]);
    expect(store.getState().nodes[0].params.detune).toBe(0);
  });

  it("leaves to the patch the knobs that make a pattern", () => {
    const { id } = store.getState().addNode("sequencer", { x: 0, y: 0 });
    renderInSong(id);

    fireEvent.keyDown(screen.getByRole("slider", { name: "Length" }), { key: "ArrowDown" });

    expect(store.getState().nodes[0].params.length).toBe(15);
    expect(lanes()).toEqual({});
  });

  it("names a knob inside a subpatch by its path", () => {
    const sub = store.getState().addNode("subpatch", { x: 0, y: 0 });
    store.getState().openSubpatch(sub.id);
    const { id } = store.getState().addNode("oscillator", { x: 0, y: 0 });
    renderInSong(id);

    drag(screen.getByRole("slider", { name: "Detune" }));

    expect(Object.keys(lanes())).toEqual([`${sub.id}/${id}.detune`]);
  });

  it("records a param published on a subpatch as the param inside", () => {
    const sub = store.getState().addNode("subpatch", { x: 0, y: 0 });
    store.getState().openSubpatch(sub.id);
    const { id } = store.getState().addNode("oscillator", { x: 0, y: 0 });
    store.getState().togglePublished(id, "detune");
    store.getState().closeSubpatch(0);
    renderInSong(sub.id);

    drag(screen.getByRole("slider", { name: "Oscillator Detune" }));

    expect(Object.keys(lanes())).toEqual([`${sub.id}/${id}.detune`]);
  });

  it("sets the mute of a mixer channel in the song on the cursor while stopped", () => {
    position = undefined;
    store.getState().addNode("oscillator", { x: 0, y: 0 });
    const mixer = store.getState().addNode("mixer", { x: 0, y: 0 });
    const cable = store.getState().connect({ nodeId: "oscillator-1", port: "audio" }, { nodeId: mixer.id, port: "audio" })!;
    store.getState().setSongCursor(1);
    renderInSong(mixer.id);

    fireEvent.click(screen.getByRole("button", { name: /^Mute/ }));

    expect(store.getState().connections[0].mute).toBeUndefined();
    expect(lanes()).toEqual({ [`${cable.id}.mute`]: "4:1" });
  });
});

describe("ModuleNode pinned knobs", () => {
  it("pins a knob to perform from its menu, and marks it", () => {
    const { container } = renderNode("filter");

    fireEvent.contextMenu(screen.getByRole("slider", { name: "Freq" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Pin to Perform" }));

    expect(store.getState().perform).toEqual([{ key: "filter-1.frequency" }]);
    expect(container.querySelector(".param-pinned")).toHaveTextContent("Freq");
  });

  it("pins a knob inside a subpatch by its path, and a param published on the subpatch as the param inside", () => {
    const sub = store.getState().addNode("subpatch", { x: 0, y: 0 });
    store.getState().openSubpatch(sub.id);
    const { id } = store.getState().addNode("oscillator", { x: 0, y: 0 });
    renderExisting(id);

    fireEvent.contextMenu(screen.getByRole("slider", { name: "Freq" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Pin to Perform" }));
    expect(store.getState().perform).toEqual([{ key: `${sub.id}/${id}.frequency` }]);

    store.getState().togglePublished(id, "detune");
    store.getState().closeSubpatch(0);
    cleanup();
    renderExisting(sub.id);
    fireEvent.contextMenu(screen.getByRole("slider", { name: "Oscillator Detune" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Pin to Perform" }));

    expect(store.getState().perform.map(({ key }) => key)).toEqual([`${sub.id}/${id}.frequency`, `${sub.id}/${id}.detune`]);
  });

  it("offers no pin for the knobs that make a pattern", () => {
    renderNode("sequencer");

    fireEvent.contextMenu(screen.getByRole("slider", { name: "Length" }));

    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("ModuleNode pinned mixer", () => {
  it("pins the whole mixer from its own level knob too, and marks the knob", () => {
    const mixer = store.getState().addNode("mixer", { x: 0, y: 0 });
    const { container } = renderExisting(mixer.id);

    fireEvent.contextMenu(screen.getByRole("slider", { name: "Level" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Pin to Perform" }));

    expect(store.getState().perform).toEqual([{ key: mixer.id }]);
    expect(container.querySelector(".param-pinned")).toHaveTextContent("Level");
  });

  it("pins the whole mixer to perform from the menu of a right click on a channel, and marks its channels", () => {
    const noise = store.getState().addNode("noise", { x: 0, y: 0 });
    const mixer = store.getState().addNode("mixer", { x: 0, y: 0 });
    store.getState().connect({ nodeId: noise.id, port: "audio" }, { nodeId: mixer.id, port: "audio" });
    const { container } = renderExisting(mixer.id);

    fireEvent.contextMenu(screen.getByRole("slider", { name: /level$/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Pin to Perform" }));

    expect(store.getState().perform).toEqual([{ key: mixer.id }]);
    expect(container.querySelector(".mixer-channel-pinned")).not.toBeNull();
  });
});
