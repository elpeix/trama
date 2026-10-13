import { describe, expect, it, vi } from "vitest";
import { displayEngine } from "../test/displayEngine";
import { scopedEngine } from "./scopedEngine";

describe("scopedEngine", () => {
  it("asks the engine about the nodes inside a subpatch by their ids once flattened", () => {
    const engine = displayEngine({ getPosition: vi.fn(() => 3), getProbe: vi.fn() });

    const scoped = scopedEngine(engine, ["subpatch-1", "subpatch-4"]);

    expect(scoped.getPosition("sequencer-5")).toBe(3);
    expect(engine.getPosition).toHaveBeenCalledWith("subpatch-1/subpatch-4/sequencer-5");
    scoped.getProbe("mixer-6", "a:audio->mixer-6:audio");
    expect(engine.getProbe).toHaveBeenCalledWith("subpatch-1/subpatch-4/mixer-6", "subpatch-1/subpatch-4/a:audio->mixer-6:audio");
    scoped.launchPattern("sequencer-5", "A2");
    expect(engine.launchPattern).toHaveBeenCalledWith("subpatch-1/subpatch-4/sequencer-5", "A2", undefined);
    scoped.launchPattern("sequencer-5", "A3", "bar");
    expect(engine.launchPattern).toHaveBeenCalledWith("subpatch-1/subpatch-4/sequencer-5", "A3", "bar");
    scoped.getInputStatus("audioInput-7");
    expect(engine.getInputStatus).toHaveBeenCalledWith("subpatch-1/subpatch-4/audioInput-7");
    scoped.getMidiState("midiInput-8");
    expect(engine.getMidiState).toHaveBeenCalledWith("subpatch-1/subpatch-4/midiInput-8");
    scoped.isOutputMuted("output-2");
    expect(engine.isOutputMuted).toHaveBeenCalledWith("subpatch-1/subpatch-4/output-2");
    scoped.unmuteOutput("output-2");
    expect(engine.unmuteOutput).toHaveBeenCalledWith("subpatch-1/subpatch-4/output-2");
    scoped.getVoiceUsage("subpatch-9");
    expect(engine.getVoiceUsage).toHaveBeenCalledWith("subpatch-1/subpatch-4/subpatch-9");
    scoped.getSample("sampler-8");
    expect(engine.getSample).toHaveBeenCalledWith("subpatch-1/subpatch-4/sampler-8");
    scoped.getBeat();
    expect(engine.getBeat).toHaveBeenCalled();
    scoped.getSongBar();
    expect(engine.getSongBar).toHaveBeenCalled();
  });

  it("is the engine itself at the top", () => {
    const engine = displayEngine();

    expect(scopedEngine(engine, [])).toBe(engine);
  });
});
