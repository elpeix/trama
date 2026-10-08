import { amountCable, AMOUNT, CHANNEL_CONTROLS, controlKey, controlLabel, isChannelKey, parseControlKey, type ControlKey } from "./automation";
import { knobAt, pinnableChannel } from "./perform";
import { moduleRegistry, paramHidden, type NumberParamDefinition } from "./registry";
import { patternIds } from "./patterns";
import type { Graph } from "./types";

/** A control a song can move: its value in the patch, and the param that tells its range and how it reads. */
export interface SongControlInfo {
  kind: "knob" | "pan" | "switch";
  value: number;
  definition: NumberParamDefinition;
}

const LEVEL: NumberParamDefinition = { id: "level", label: "Level", kind: "number", min: 0, max: 1, step: 0.01, default: 1, scale: "linear" };
const PAN: NumberParamDefinition = { id: "pan", label: "Pan", kind: "number", min: -1, max: 1, step: 0.01, default: 0, scale: "linear" };
const SWITCH: NumberParamDefinition = {
  id: "switch",
  label: "Switch",
  kind: "number",
  min: 0,
  max: 1,
  step: 1,
  default: 0,
  scale: "linear",
  valueNames: ["Off", "On"],
};
const AMOUNT_DEFINITION: NumberParamDefinition = { ...PAN, id: AMOUNT, label: "Amount", default: 1 };

export function songControlAt(graph: Graph, key: ControlKey): SongControlInfo | undefined {
  const { target, name } = parseControlKey(key);
  if (isChannelKey(key)) {
    const channel = pinnableChannel(graph, target);
    if (channel) {
      switch (name) {
        case "level":
          return { kind: "knob", value: channel.amount ?? 1, definition: LEVEL };
        case "pan":
          return { kind: "pan", value: channel.pan ?? 0, definition: PAN };
        case "mute":
        case "solo":
          return { kind: "switch", value: channel[name] ? 1 : 0, definition: SWITCH };
      }
    }
    const cable = name === AMOUNT ? amountCable(graph, target) : undefined;
    return cable && { kind: "knob", value: cable.amount ?? 1, definition: AMOUNT_DEFINITION };
  }
  const knob = knobAt(graph, key);
  return knob && { kind: "knob", value: Number(knob.node.params[knob.definition.id] ?? knob.definition.default), definition: knob.definition };
}

function keysOf(graph: Graph, prefix: string): ControlKey[] {
  const nodes = graph.nodes.flatMap((node) => {
    const path = `${prefix}${node.id}`;
    const own = moduleRegistry[node.type].params
      .filter((param) => param.kind === "number" && !patternIds(node.type).includes(param.id) && !paramHidden(param, node.params))
      .map((param) => controlKey(path, param.id));
    return node.patch ? [...own, ...keysOf(node.patch, `${path}/`)] : own;
  });
  const cables = graph.connections.flatMap((connection) => {
    const path = `${prefix}${connection.id}`;
    return [...CHANNEL_CONTROLS.map((name) => controlKey(path, name)), controlKey(path, AMOUNT)];
  });
  return [...nodes, ...cables];
}

/** Every control a song can move, with its name: the knobs of the nodes, the settings of the mixer channels and the amounts of the control cables. */
export function songControls(graph: Graph): { key: ControlKey; label: string }[] {
  return keysOf(graph, "")
    .filter((key) => songControlAt(graph, key) !== undefined)
    .map((key) => ({ key, label: controlLabel(graph, key) }));
}
