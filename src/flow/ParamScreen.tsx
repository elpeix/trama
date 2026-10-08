import type { ReactNode } from "react";
import { beatsPerStep } from "../audio/modules/StepClock";
import { PublishButton, type ParamControlProps } from "../components/controls/ParamControl";
import { SampleDisplay } from "../components/displays/SampleDisplay";
import { NotesPicker } from "../components/keys/NotesPicker";
import { ClipPreview } from "../components/sequencing/ClipPreview";
import { RhythmRow } from "../components/sequencing/RhythmRow";
import { StepGrid } from "../components/sequencing/StepGrid";
import { StepMarks } from "../components/sequencing/StepMarks";
import { StepTextButton } from "../components/sequencing/StepTextDialog";
import { rhythmTextRow } from "../components/sequencing/stepTextRows";
import {
  moduleRegistry,
  type ClipParamDefinition,
  type NotesParamDefinition,
  type NumberParamDefinition,
  type RhythmParamDefinition,
  type SampleParamDefinition,
  type SequenceParamDefinition,
} from "../patch/registry";
import { stepAccents } from "../patch/meter";
import { readSequenceText } from "../patch/stepText";
import type { NodeType, ParamValue, Params } from "../patch/types";
import { usePatchStore } from "../store/usePatchStore";

export type ScreenParamDefinition =
  | SampleParamDefinition
  | ClipParamDefinition
  | SequenceParamDefinition
  | NotesParamDefinition;

type Change = (name: string, value: ParamValue, options?: { merge?: boolean | string }) => void;

interface ParamScreenProps {
  type: NodeType;
  nodeId: string;
  /** What the node and the pattern edited are called, to title the steps as text. */
  title: string;
  definition: ScreenParamDefinition;
  params: Params;
  onChange: Change;
  /** Opens the piano roll on a clip. */
  onEdit?(): void;
  publish?: ParamControlProps["publish"];
  /** What goes under the screen, such as the MIDI of a Seq. */
  children?: ReactNode;
}

const useStepAccents = (params: Params, count: number) => {
  const meter = usePatchStore((state) => state.meter);
  return stepAccents(count, beatsPerStep(String(params.division)), meter);
};

/** The screen a param is set on, the same on its node and on the subpatch it is published on. */
export function ParamScreen({ type, nodeId, title, definition, params, onChange, onEdit, publish, children }: ParamScreenProps) {
  const change = (name: string) => (value: ParamValue, options?: { merge?: boolean | string }) =>
    onChange(name, value, options ?? { merge: false });
  const publishButton = publish && <PublishButton label={definition.label} publish={publish} />;
  const accents = useStepAccents(params, definition.kind === "sequence" ? definition.steps : 0);
  switch (definition.kind) {
    case "sample":
      return (
        <div className="module-display param-screen">
          <SampleDisplay
            nodeId={nodeId}
            value={String(params[definition.id] ?? "")}
            start={Number(params.start)}
            end={Number(params.end)}
            onChange={change(definition.id)}
          />
          {publishButton}
        </div>
      );
    case "clip":
      return (
        <div className="param-screen">
          <ClipPreview
            nodeId={nodeId}
            definition={definition}
            value={String(params[definition.id])}
            bars={Number(params.bars)}
            onEdit={() => onEdit?.()}
          />
          {publishButton}
        </div>
      );
    case "sequence":
      return (
        <div className="module-display param-screen">
          <StepGrid
            nodeId={nodeId}
            definition={definition}
            value={String(params[definition.id])}
            length={Number(params.length)}
            octave={Number(params.octave)}
            scale={String(params.scale)}
            root={String(params.root)}
            accents={accents}
            onChange={change(definition.id)}
          />
          <StepMarks
            value={String(params[definition.id])}
            length={Number(params.length)}
            accents={accents}
            onChange={change(definition.id)}
          />
          <div className="screen-buttons nodrag">
            <StepTextButton
              title={title}
              rows={[
                {
                  id: definition.id,
                  label: definition.label,
                  value: String(params[definition.id]),
                  read: (text) => readSequenceText(text, definition),
                },
              ]}
              onApply={(values) => onChange(definition.id, values[definition.id], { merge: false })}
            />
            {children}
          </div>
          {publishButton}
        </div>
      );
    case "notes": {
      const octave = moduleRegistry[type].params.find(
        (param): param is NumberParamDefinition => param.kind === "number" && param.id === definition.octave,
      );
      if (!octave || params[definition.when.param] !== definition.when.value) {
        return null;
      }
      return (
        <div className="param-screen">
          <NotesPicker
            nodeId={nodeId}
            definition={definition}
            value={String(params[definition.id])}
            onChange={change(definition.id)}
            octave={Number(params[octave.id])}
            transpose={Number(params.transpose ?? 0)}
            onOctaveChange={change(octave.id)}
            octaves={octave}
          />
          {publishButton}
        </div>
      );
    }
  }
}

interface RhythmScreenProps {
  nodeId: string;
  /** What the node and the pattern edited are called, to title the steps as text. */
  title: string;
  rhythms: readonly RhythmParamDefinition[];
  params: Params;
  onChange: Change;
  /** Changes several rows at once, as one undo step. */
  onChanges: (values: Record<string, string>) => void;
  /** Publishes all the rows at once. */
  publish?: ParamControlProps["publish"];
}

/**
 * The rows of steps of a node, named when there are several, the same on its node and on its
 * subpatch. Several rows, as on a Drums, have a pencil that writes them all as text.
 */
export function RhythmScreen({ nodeId, title, rhythms, params, onChange, onChanges, publish }: RhythmScreenProps) {
  const named = rhythms.length > 1;
  const accents = useStepAccents(params, Math.max(...rhythms.map((rhythm) => rhythm.steps)));
  return (
    <div className={named ? "rhythms param-screen" : "param-screen"}>
      {rhythms.map((rhythm) => (
        <RhythmRow
          key={rhythm.id}
          nodeId={nodeId}
          definition={rhythm}
          value={String(params[rhythm.id])}
          length={Number(params[rhythm.length])}
          named={named}
          accents={accents}
          onChange={(value, options) => onChange(rhythm.id, value, options ?? { merge: false })}
        />
      ))}
      {named && (
        <div className="screen-buttons rhythm-buttons nodrag">
          <StepTextButton
            title={title}
            rows={rhythms.map((rhythm) => rhythmTextRow(rhythm, params))}
            onApply={onChanges}
          />
        </div>
      )}
      {publish && <PublishButton label={named ? "Rows" : rhythms[0].label} publish={publish} />}
    </div>
  );
}
