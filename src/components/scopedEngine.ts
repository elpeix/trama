import type { NodeId } from "../patch/types";
import type { DisplayEngine } from "./EngineContext";

/**
 * The engine as the graph inside a subpatch sees it: the engine plays the patch flattened, so the
 * ids of the nodes and cables inside go to it prefixed with the path of subpatches down to them.
 */
export function scopedEngine(engine: DisplayEngine, path: readonly NodeId[]): DisplayEngine {
  if (path.length === 0) {
    return engine;
  }
  const prefix = `${path.join("/")}/`;
  const inside = (id: string) => `${prefix}${id}`;
  return {
    getAnalyser: (nodeId) => engine.getAnalyser(inside(nodeId)),
    getProbe: (nodeId, connectionId) => engine.getProbe(inside(nodeId), inside(connectionId)),
    getNotes: (nodeId) => engine.getNotes(inside(nodeId)),
    getPosition: (nodeId) => engine.getPosition(inside(nodeId)),
    getBeat: () => engine.getBeat(),
    getSongBar: () => engine.getSongBar(),
    getModulation: (nodeId, port) => engine.getModulation(inside(nodeId), port),
    getKeyTranspose: (nodeId) => engine.getKeyTranspose(inside(nodeId)),
    getInputStatus: (nodeId) => engine.getInputStatus(inside(nodeId)),
    isOutputMuted: (nodeId) => engine.isOutputMuted(inside(nodeId)),
    unmuteOutput: (nodeId) => engine.unmuteOutput(inside(nodeId)),
    getVoiceUsage: (nodeId) => engine.getVoiceUsage(inside(nodeId)),
    getSample: (nodeId) => engine.getSample(inside(nodeId)),
    getPattern: (nodeId) => engine.getPattern(inside(nodeId)),
    launchPattern: (nodeId, slot, mode) => engine.launchPattern(inside(nodeId), slot, mode),
    previewNote: (nodeId, note, velocity) => engine.previewNote(inside(nodeId), note, velocity),
    stopPreview: (nodeId) => engine.stopPreview(inside(nodeId)),
  };
}
