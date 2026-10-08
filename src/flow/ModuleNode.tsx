import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useContext, useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { CurveEditor } from "../components/controls/CurveEditor";
import { EngineContext } from "../components/EngineContext";
import { KeysPanel } from "../components/keys/KeysPanel";
import { ParamControl } from "../components/controls/ParamControl";
import { InputDisplay } from "../components/displays/InputDisplay";
import { VoiceUsageDisplay } from "../components/displays/VoiceUsageDisplay";
import { OutputDisplay } from "../components/displays/OutputDisplay";
import { MixerDisplay } from "../components/displays/MixerDisplay";
import { PatternSlots } from "../components/sequencing/PatternSlots";
import { ScopeDisplay } from "../components/displays/ScopeDisplay";
import { SequenceMidi } from "../components/sequencing/SequenceMidi";
import { StepTextButton } from "../components/sequencing/StepTextDialog";
import { notesTextRow, rhythmTextRow } from "../components/sequencing/stepTextRows";
import { WavePreview } from "../components/displays/WavePreview";
import { scopeTraces, traceLabel } from "../components/displays/scopeTrace";
import { controlKey } from "../patch/automation";
import { beatsPerBar } from "../patch/meter";
import { addedPitches, paramLock } from "../patch/params";
import { FIRST_SLOT, patternAt, patternIds } from "../patch/patterns";
import { portsOfNode, publishedParams } from "../patch/subpatch";
import type { NodeType, ParamValue, PatternSlot } from "../patch/types";
import {
  moduleRegistry,
  paramHidden,
  type ClipParamDefinition,
  type CurveParamDefinition,
  type NotesParamDefinition,
  type NumberParamDefinition,
  type ParamDefinition,
  type PortDefinition,
  type RhythmParamDefinition,
  type SampleParamDefinition,
  type SelectParamDefinition,
} from "../patch/registry";
import { usePatchStore } from "../store/usePatchStore";
import type { FlowNode } from "./flowAdapter";
import { NodeTitle } from "./NodeTitle";
import { ParamScreen, RhythmScreen } from "./ParamScreen";
import { SubpatchFace } from "./SubpatchFace";
import { PresetMenu } from "./PresetMenu";
import { HelpTip } from "./HelpTip";
import { hasPresets } from "../patch/presets";
import { RemoveIcon } from "../components/RemoveIcon";

const portLabel = (port: PortDefinition, direction: "in" | "out") =>
  port.label ? `${port.label} ${direction}` : port.id === direction ? direction : `${port.id} ${direction}`;

const DYNAMIC_PORTS: readonly NodeType[] = ["subpatch", "inlet", "outlet"];

/** The knob a control In of a subpatch shows outside: its value, like that of a param. */
const INLET_KNOB: NumberParamDefinition = {
  id: "value",
  label: "Value",
  kind: "number",
  min: -1,
  max: 1,
  step: 0.01,
  default: 0,
  scale: "linear",
  modulationRange: 1,
};

export function ModuleNode({ id, data }: Pick<NodeProps<FlowNode>, "id" | "data">) {
  const { type } = data;
  const definition = moduleRegistry[type];
  const engine = useContext(EngineContext);
  const updateParam = usePatchStore((state) => state.updateParam);
  const updateParams = usePatchStore((state) => state.updateParams);
  const [editing, setEditing] = useState<PatternSlot>(FIRST_SLOT);
  const pattern = patternAt(data.patterns, editing);
  const params = pattern ? { ...data.params, ...pattern } : data.params;
  const update = (name: string, value: ParamValue, options?: { merge?: boolean | string }) =>
    updateParam(id, name, value, { ...options, pattern: editing });
  const screenTitle = `${data.name ?? definition.title} · ${editing}`;
  const setConnectionAmount = usePatchStore((state) => state.setConnectionAmount);
  const setConnectionSwitch = usePatchStore((state) => state.setConnectionSwitch);
  const setConnectionPan = usePatchStore((state) => state.setConnectionPan);
  const removeNode = usePatchStore((state) => state.removeNode);
  const renameNode = usePatchStore((state) => state.renameNode);
  const openClipEditor = usePatchStore((state) => state.openClipEditor);
  const path = usePatchStore((state) => state.path);
  const clipPath = useMemo(() => [...path, id], [path, id]);
  const editsClip = usePatchStore((state) => state.clipEditor?.join("/") === clipPath.join("/"));
  // The piano roll open on this clip follows the pattern edited on the node.
  useEffect(() => {
    if (editsClip) {
      openClipEditor(clipPath, editing);
    }
  }, [editsClip, editing, clipPath, openClipEditor]);
  const openSubpatch = usePatchStore((state) => state.openSubpatch);
  const updateInnerParam = usePatchStore((state) => state.updateInnerParam);
  const fedInputs = usePatchStore(
    useShallow((state) =>
      state.connections.filter((connection) => connection.target.nodeId === id).map((connection) => connection.target.port),
    ),
  );
  const togglePublished = usePatchStore((state) => state.togglePublished);
  const insideSubpatch = usePatchStore((state) => state.path.length > 0);
  const songControl = (nodeId: string, name: string) => controlKey([...path, nodeId].join("/"), name);
  const pinnedKeys = usePatchStore(useShallow((state) => state.perform.map(({ key }) => key)));
  const togglePinned = usePatchStore((state) => state.togglePinned);
  const publishOf = (...params: string[]) =>
    insideSubpatch
      ? {
          published: params.every((param) => publishedHere.includes(param)),
          onToggle: () => togglePublished(id, params),
        }
      : undefined;
  const pinOf = (key: string | undefined) =>
    key === undefined ? undefined : { pinned: pinnedKeys.includes(key), onToggle: () => togglePinned(key) };
  const ownPatterns = patternIds(type);
  const publishedHere = usePatchStore(
    useShallow((state) => state.published.filter((entry) => entry.node === id).map((entry) => entry.param)),
  );
  const tempo = usePatchStore((state) => state.tempo);
  const beats = usePatchStore((state) => beatsPerBar(state.meter));
  const modulated = usePatchStore(
    useShallow((state) =>
      state.connections
        .filter((connection) => connection.target.nodeId === id)
        .map((connection) => connection.target.port),
    ),
  );
  const nodes = usePatchStore((state) => state.nodes);
  const connections = usePatchStore((state) => state.connections);
  const traces = useMemo(
    () => (definition.display === "scope" ? scopeTraces(id, nodes, connections) : []),
    [definition.display, id, nodes, connections],
  );
  const channels = useMemo(
    () =>
      definition.display === "mixer"
        ? connections
            .filter((connection) => connection.target.nodeId === id && connection.target.port === "audio")
            .map((connection) => {
              const source = nodes.find((candidate) => candidate.id === connection.source.nodeId);
              return {
                id: connection.id,
                label: source ? traceLabel(source, connection.source.port) : connection.id,
                level: connection.amount ?? 1,
                pan: connection.pan ?? 0,
                mute: connection.mute === true,
                solo: connection.solo === true,
              };
            })
        : [],
    [definition.display, id, nodes, connections],
  );
  const addedPitch = useMemo(() => addedPitches(id, connections), [id, connections]);
  const ownNotes = definition.params.find((param): param is NotesParamDefinition => param.kind === "notes");
  const playsOwnNotes = ownNotes !== undefined && params[ownNotes.when.param] === ownNotes.when.value;
  const notesOctave = definition.params.find(
    (param): param is NumberParamDefinition => param.kind === "number" && param.id === ownNotes?.octave,
  );
  const launch = definition.patterns
    ? definition.params.find((param): param is SelectParamDefinition => param.id === "launch" && param.kind === "select")
    : undefined;
  // Sequences, notes, their octave, rhythms, curves, clips, samples and the reference cable are set on the displays the node draws.
  const controls = definition.params.filter(
    (param) =>
      param.kind !== "sequence" &&
      param.kind !== "notes" &&
      param.kind !== "rhythm" &&
      param.kind !== "cable" &&
      param.kind !== "curve" &&
      param.kind !== "clip" &&
      param.kind !== "sample" &&
      param !== notesOctave &&
      param !== launch &&
      !paramHidden(param, params),
  );
  const curves = definition.params.filter(
    (param): param is CurveParamDefinition =>
      param.kind === "curve" && (!param.when || params[param.when.param] === param.when.value),
  );
  const rhythms = definition.params.filter((param): param is RhythmParamDefinition => param.kind === "rhythm");
  const clip = definition.params.find((param): param is ClipParamDefinition => param.kind === "clip");
  const sample = definition.params.find((param): param is SampleParamDefinition => param.kind === "sample");
  const sequence = definition.params.find((param) => param.kind === "sequence");
  const nodePorts = DYNAMIC_PORTS.includes(type)
    ? portsOfNode({ type, params, patch: data.patch, published: data.published })
    : { inputs: definition.inputs, outputs: definition.outputs };
  const ports = {
    ...nodePorts,
    outputs: nodePorts.outputs.map((port) =>
      port.fed && fedInputs.includes(port.fed.input) ? { ...port, label: port.fed.label } : port,
    ),
  };
  const allPublished = type === "subpatch" ? publishedParams({ published: data.published, patch: data.patch }) : [];
  // A param hidden inside is hidden outside too; its port, if it has one, stays as a plain port.
  const published = allPublished.filter(
    (control) => !control.hidden && (control.definition.kind === "number" || control.definition.kind === "select"),
  );
  const knobInputs =
    type === "subpatch"
      ? ports.inputs.filter((port) => port.type === "control" && !allPublished.some(({ key }) => key === port.id))
      : [];
  const portInputs = ports.inputs.filter(
    (port) => !knobInputs.includes(port) && !published.some(({ key }) => key === port.id),
  );
  const rows = Math.max(portInputs.length, ports.outputs.length);

  const compact = definition.patterns !== undefined;
  const knobs = controls.filter((param) => param.kind === "number");
  const selects = controls.filter((param) => param.kind !== "number");
  const paramRow = (param: ParamDefinition) => (
    <div key={param.id} className="module-row">
      {param.kind === "number" && param.modulationRange !== undefined && (
        <Handle
          id={param.id}
          type="target"
          position={Position.Left}
          className="port port-control"
        />
      )}
      <ParamControl
        definition={param}
        value={params[param.id]}
        onChange={(value, options) => update(param.id, value, options)}
        control={param.kind === "number" && !ownPatterns.includes(param.id) ? songControl(id, param.id) : undefined}
        pin={
          type === "mixer"
            ? pinOf([...path, id].join("/"))
            : pinOf(param.kind === "number" && !ownPatterns.includes(param.id) ? songControl(id, param.id) : undefined)
        }
        locked={paramLock(param, params, tempo, beats)}
        modulation={
          engine && modulated.includes(param.id) ? () => engine.getModulation(id, param.id) : undefined
        }
        publish={param.kind === "number" || param.kind === "select" ? publishOf(param.id) : undefined}
      />
      {param.kind === "number" &&
        param.modulationHint &&
        modulated.includes(param.id) &&
        Number(params[param.id]) !== param.min && (
          <p className="param-hint">{param.modulationHint}</p>
        )}
      {addedPitch.includes(param.id) && <p className="param-hint">Two pitch sources add up</p>}
    </div>
  );
  const patternSlots = launch && (
    <PatternSlots
      nodeId={id}
      editing={editing}
      onEdit={setEditing}
      launch={launch}
      launchMode={String(params[launch.id])}
      onLaunchMode={(mode) => update(launch.id, mode)}
    />
  );
  const plays = (
    <>
      {curves.length > 0 && (
        <div className="module-curves">
          {curves.map((curve) => (
            <CurveEditor
              key={curve.id}
              definition={curve}
              value={String(params[curve.id])}
              onChange={(value, options) => update(curve.id, value, options ?? { merge: false })}
            />
          ))}
        </div>
      )}
      {definition.display && definition.display !== "sample" && definition.display !== "steps" && (
        <div className="module-display">
          {definition.display === "scope" && (
            <ScopeDisplay
              nodeId={id}
              time={Number(params.time)}
              range={Number(params.range)}
              traces={traces}
              trigger={String(params.trigger ?? "")}
              onTrigger={(trace) => update("trigger", trace, { merge: false })}
            />
          )}
          {definition.display === "meter" && <OutputDisplay nodeId={id} />}
          {definition.display === "input" && <InputDisplay nodeId={id} />}
          {definition.display === "wave" && (
            <WavePreview
              nodeId={id}
              harmonics={String(params.harmonics)}
              brightness={Number(params.brightness)}
              even={Number(params.even)}
            />
          )}
          {definition.display === "mixer" && (
            <MixerDisplay
              nodeId={id}
              channels={channels}
              onLevel={(connection, level, options) => setConnectionAmount(connection, level, options)}
              onPan={(connection, pan, options) => setConnectionPan(connection, pan, options)}
              onSwitch={setConnectionSwitch}
              control={(connection, name) => songControl(connection, name)}
              pin={{ ...pinOf([...path, id].join("/"))!, label: data.name ?? definition.title }}
            />
          )}
        </div>
      )}
      {definition.display === "sample" && sample && (
        <ParamScreen
          type={type}
          nodeId={id}
          title={screenTitle}
          definition={sample}
          params={params}
          onChange={update}
          publish={publishOf(sample.id)}
        />
      )}
      {definition.display === "steps" && sequence && (
        <ParamScreen type={type} nodeId={id} title={screenTitle} definition={sequence} params={params} onChange={update} publish={publishOf(sequence.id)}>
          <SequenceMidi nodeId={id} name={data.name ?? definition.title} definition={sequence} params={params} pattern={editing} />
        </ParamScreen>
      )}
      {clip && (
        <ParamScreen
          type={type}
          nodeId={id}
          title={screenTitle}
          definition={clip}
          params={params}
          onChange={update}
          onEdit={() => openClipEditor(clipPath, editing)}
          publish={publishOf(clip.id)}
        />
      )}
      {rhythms.length > 0 && (
        <RhythmScreen
          nodeId={id}
          title={screenTitle}
          rhythms={rhythms}
          params={params}
          onChange={update}
          onChanges={(values) => updateParams(id, values, { pattern: editing })}
          publish={publishOf(...rhythms.map((rhythm) => rhythm.id))}
        />
      )}
      {definition.playedFromKeys && !playsOwnNotes && (
        <KeysPanel nodeId={id} transpose={Number(params.transpose ?? 0)} />
      )}
      {ownNotes && (
        <ParamScreen
          type={type}
          nodeId={id}
          title={screenTitle}
          definition={ownNotes}
          params={params}
          onChange={update}
          publish={publishOf(ownNotes.id)}
        />
      )}
      {rhythms.length === 1 && (
        <div className="screen-buttons rhythm-buttons nodrag">
          <StepTextButton
            title={screenTitle}
            rows={[
              rhythmTextRow(rhythms[0], params),
              ...(ownNotes && playsOwnNotes ? [notesTextRow(ownNotes, params)] : []),
            ]}
            onApply={(values) => updateParams(id, values, { pattern: editing })}
          />
        </div>
      )}
    </>
  );

  return (
    <div className={`module module-${type}`} data-category={definition.category}>
      <header className="module-header">
        <NodeTitle title={definition.title} name={data.name} onRename={(name) => renameNode(id, name)} />
        {definition.hint && !playsOwnNotes && <HelpTip label={`Help for ${data.name ?? definition.title}`} text={definition.hint} />}
        {hasPresets(type) && <PresetMenu nodeId={id} type={type} title={definition.title} name={data.name} />}
        <button
          type="button"
          className="remove-badge module-remove nodrag"
          aria-label={`Remove ${data.name ?? definition.title}`}
          onClick={() => removeNode(id)}
        >
          <RemoveIcon />
        </button>
      </header>
      {rows > 0 && (
        <div className="module-ports">
          {Array.from({ length: rows }, (_, index) => {
            const input = portInputs[index];
            const output = ports.outputs[index];
            return (
              <div key={index} className="module-row module-port-row">
                {input && (
                  <>
                    <Handle
                      id={input.id}
                      type="target"
                      position={Position.Left}
                      className={`port port-${input.type}`}
                    />
                    <span className="port-label">{portLabel(input, "in")}</span>
                  </>
                )}
                {output && (
                  <>
                    <span className="port-label port-label-out">{portLabel(output, "out")}</span>
                    <Handle
                      id={output.id}
                      type="source"
                      position={Position.Right}
                      className={`port port-${output.type}`}
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
      {knobInputs.length > 0 && (
        <div className="module-params">
          {knobInputs.map((port) => {
            const inlet = data.patch?.nodes.find((node) => node.id === port.id);
            return (
              <div key={port.id} className="module-row">
                <Handle id={port.id} type="target" position={Position.Left} className="port port-control" />
                <ParamControl
                  definition={{ ...INLET_KNOB, id: port.id, label: port.label ?? port.id }}
                  value={Number(inlet?.params.value ?? 0)}
                  onChange={(value, options) => updateInnerParam(id, port.id, "value", value, options)}
                  control={songControl(`${id}/${port.id}`, "value")}
                  pin={pinOf(songControl(`${id}/${port.id}`, "value"))}
                />
              </div>
            );
          })}
        </div>
      )}
      {type === "subpatch" && (
        <SubpatchFace
          id={id}
          subpatch={{ published: data.published, patch: data.patch }}
          inputs={ports.inputs.map((port) => port.id)}
          modulated={modulated}
          songControl={songControl}
          pinOf={pinOf}
          publishOf={publishOf}
        />
      )}
      {type === "subpatch" && <VoiceUsageDisplay nodeId={id} />}
      {type === "subpatch" && (
        <div className="subpatch-open">
          <span className="subpatch-count">
            {data.patch?.nodes.length ?? 0} {data.patch?.nodes.length === 1 ? "module" : "modules"}
          </span>
          <button type="button" className="hw subpatch-open-button nodrag" onClick={() => openSubpatch(id)}>
            Open
          </button>
        </div>
      )}
      {patternSlots}
      {compact ? (
        <>
          {knobs.length > 0 && <div className="module-params module-knobs">{knobs.map(paramRow)}</div>}
          {selects.length > 0 && <div className="module-params module-selects">{selects.map(paramRow)}</div>}
        </>
      ) : (
        controls.length > 0 && <div className="module-params">{controls.map(paramRow)}</div>
      )}
      {plays}
    </div>
  );
}
