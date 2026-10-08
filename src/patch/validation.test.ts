import { describe, expect, it } from "vitest";
import type { NodeType, Patch, PatchConnection, PatchNode } from "./types";
import { canConnectPorts, validateConnection } from "./validation";

const node = (id: string, type: NodeType): PatchNode => ({
  id,
  type,
  position: { x: 0, y: 0 },
  params: {},
});

const link = (id: string, source: string, target: string): PatchConnection => ({
  id,
  source: { nodeId: source, port: "audio" },
  target: { nodeId: target, port: "audio" },
});

const patch = (connections: PatchConnection[] = []): Patch => ({
  tempo: 120,
  nodes: [
    node("osc", "oscillator"),
    node("filter", "filter"),
    node("gain", "gain"),
    node("out", "output"),
  ],
  connections,
});

describe("canConnectPorts", () => {
  it.each([
    ["audio", "audio", true],
    ["control", "control", true],
    ["trigger", "trigger", true],
    ["audio", "trigger", false],
    ["trigger", "audio", false],
    ["audio", "control", false],
  ] as const)("%s -> %s is %s", (source, target, expected) => {
    expect(canConnectPorts({ id: "a", type: source }, { id: "b", type: target })).toBe(
      expected,
    );
  });
});

describe("validateConnection", () => {
  it("accepts an audio output into an audio input", () => {
    expect(validateConnection(patch(), link("c", "osc", "filter"))).toEqual({ ok: true });
  });

  it("rejects an unknown source node", () => {
    expect(validateConnection(patch(), link("c", "nope", "filter"))).toEqual({
      ok: false,
      reason: "unknown-node",
    });
  });

  it("rejects an unknown target node", () => {
    expect(validateConnection(patch(), link("c", "osc", "nope"))).toEqual({
      ok: false,
      reason: "unknown-node",
    });
  });

  it("rejects a source port that is not an output", () => {
    const connection = link("c", "out", "filter");
    expect(validateConnection(patch(), connection)).toEqual({
      ok: false,
      reason: "unknown-port",
    });
  });

  it("rejects a target port that is not an input", () => {
    expect(validateConnection(patch(), link("c", "filter", "osc"))).toEqual({
      ok: false,
      reason: "unknown-port",
    });
  });

  it("rejects connecting a node to itself", () => {
    expect(validateConnection(patch(), link("c", "filter", "filter"))).toEqual({
      ok: false,
      reason: "self",
    });
  });

  it("rejects a duplicate connection", () => {
    const existing = link("c1", "osc", "filter");
    expect(validateConnection(patch([existing]), link("c2", "osc", "filter"))).toEqual({
      ok: false,
      reason: "duplicate",
    });
  });

  it("rejects a connection that closes a cycle", () => {
    const current = patch([link("c1", "filter", "gain")]);
    expect(validateConnection(current, link("c2", "gain", "filter"))).toEqual({
      ok: false,
      reason: "cycle",
    });
  });

  it("rejects a connection that closes a longer cycle", () => {
    const current = patch([link("c1", "filter", "gain"), link("c2", "gain", "out")]);
    const extra: Patch = {
      ...current,
      nodes: [...current.nodes, node("gain2", "gain")],
      connections: [...current.connections, link("c3", "gain", "gain2")],
    };
    expect(validateConnection(extra, link("c4", "gain2", "filter"))).toEqual({
      ok: false,
      reason: "cycle",
    });
  });

  it("accepts fan-in and fan-out without cycles", () => {
    const current = patch([link("c1", "osc", "filter"), link("c2", "filter", "out")]);
    expect(validateConnection(current, link("c3", "osc", "gain"))).toEqual({ ok: true });
    expect(validateConnection(current, link("c4", "osc", "out"))).toEqual({ ok: true });
  });
});

describe("validateConnection with control and trigger ports", () => {
  const modular: Patch = {
    tempo: 120,
    nodes: [
      node("osc", "oscillator"),
      node("filter", "filter"),
      node("gain", "gain"),
      node("lfo", "lfo"),
      node("env", "envelope"),
      node("keys", "keyboard"),
    ],
    connections: [],
  };

  const wire = (source: string, sourcePort: string, target: string, targetPort: string) => ({
    source: { nodeId: source, port: sourcePort },
    target: { nodeId: target, port: targetPort },
  });

  it("accepts an LFO into a modulatable param", () => {
    expect(validateConnection(modular, wire("lfo", "out", "filter", "frequency"))).toEqual({
      ok: true,
    });
  });

  it("accepts an envelope into a gain", () => {
    expect(validateConnection(modular, wire("env", "out", "gain", "gain"))).toEqual({ ok: true });
  });

  it("accepts the keyboard gate into an envelope", () => {
    expect(validateConnection(modular, wire("keys", "gate", "env", "gate"))).toEqual({ ok: true });
  });

  it("accepts the keyboard pitch into the oscillator detune", () => {
    expect(validateConnection(modular, wire("keys", "pitch", "osc", "detune"))).toEqual({
      ok: true,
    });
  });

  it.each([
    ["audio into a param", wire("osc", "audio", "filter", "frequency")],
    ["control into an audio input", wire("lfo", "out", "filter", "audio")],
    ["trigger into an audio input", wire("keys", "gate", "filter", "audio")],
    ["control into a trigger input", wire("lfo", "out", "env", "gate")],
    ["trigger into a param", wire("keys", "gate", "osc", "frequency")],
  ])("rejects %s", (_name, connection) => {
    expect(validateConnection(modular, connection)).toEqual({ ok: false, reason: "incompatible" });
  });

  it("rejects a param that is not modulatable", () => {
    expect(validateConnection(modular, wire("lfo", "out", "osc", "waveform"))).toEqual({
      ok: false,
      reason: "unknown-port",
    });
  });
});
