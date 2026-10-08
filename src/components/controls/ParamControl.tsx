import { useCallback, useState, type KeyboardEvent } from "react";
import type { ControlKey } from "../../patch/automation";
import { modulatedValue } from "../../patch/params";
import type { NumberParamDefinition, ParamDefinition } from "../../patch/registry";
import { NODE_NAME_MAX_LENGTH, type ParamValue, type Position } from "../../patch/types";
import { SongKnob } from "../song/SongKnob";
import { PinMenu } from "./PinMenu";
import { formatParam, parseParam } from "./scale";

export interface ParamControlProps {
  definition: ParamDefinition;
  value: ParamValue;
  onChange: (value: ParamValue, options?: { merge?: boolean }) => void;
  locked?: { value: number; label: string };
  /** What the control cables add to the param right now; undefined when none, or while silent. */
  modulation?: () => number | undefined;
  /** A switch to publish the param on the subpatch the node is in, lit while it is. */
  publish?: { published: boolean; onToggle: () => void };
  /** Renames the param with a double-click on its name, instead of setting it back to its default. */
  onRename?: (name: string) => void;
  /** The control of the song a number param is, to show and record it there. */
  control?: ControlKey;
  /** Pins the knob to the perform panel from the menu of a right click on it, marked while it is. */
  pin?: { pinned: boolean; onToggle: () => void };
  /** What the param belongs to, shown small over its name, such as the nodes down to it. */
  context?: string;
}

const fullName = (label: string, context?: string) => (context ? `${context} › ${label}` : label);

/** A switch that publishes a param on the subpatch the node is in. */
export function PublishButton({ label, publish }: { label: string; publish: NonNullable<ParamControlProps["publish"]> }) {
  return (
    <button
      type="button"
      className="param-publish nodrag"
      aria-label={`Publish ${label}`}
      aria-pressed={publish.published}
      title={publish.published ? "Shown on the subpatch; click to take it back" : "Show on the subpatch"}
      onClick={publish.onToggle}
    />
  );
}

interface ParamLabelProps {
  label: string;
  title?: string;
  onReset?: () => void;
  onRename?: (name: string) => void;
  context?: string;
}

/** The name of a param, under what it belongs to if given: a double-click sets it back to its default, or renames it. */
export function ParamLabel({ label, title, onReset, onRename, context }: ParamLabelProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const full = fullName(label, context);
  if (draft !== null && onRename) {
    const finish = (save: boolean) => {
      if (save) {
        onRename(draft);
      }
      setDraft(null);
    };
    return (
      <input
        className="param-label-input nodrag"
        aria-label={`Name of ${full}`}
        value={draft}
        maxLength={NODE_NAME_MAX_LENGTH}
        autoFocus
        onFocus={(event) => event.target.select()}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          if (event.key === "Enter") {
            finish(true);
          } else if (event.key === "Escape") {
            finish(false);
          }
        }}
        onBlur={() => finish(true)}
      />
    );
  }
  return (
    <span
      className={context ? "param-label param-label-stacked" : "param-label"}
      title={onRename ? "Double-click to rename" : title}
      onDoubleClick={onRename ? () => setDraft(full) : onReset}
    >
      {context ? (
        <>
          <span className="param-context">{context}</span>
          <span className="param-name">{label}</span>
        </>
      ) : (
        label
      )}
    </span>
  );
}

export function ParamControl({ definition, value, onChange, locked, modulation, publish, onRename, control, pin, context }: ParamControlProps) {
  // Sequences, notes, rhythms, curves, clips, samples and the reference cable are set on the displays the node draws for them.
  if (
    definition.kind === "sequence" ||
    definition.kind === "notes" ||
    definition.kind === "rhythm" ||
    definition.kind === "cable" ||
    definition.kind === "curve" ||
    definition.kind === "clip" ||
    definition.kind === "sample"
  ) {
    return null;
  }
  if (definition.kind === "select") {
    return (
      <div className="param">
        <ParamLabel label={definition.label} onRename={onRename} />
        <select
          className="nodrag"
          aria-label={definition.label}
          value={String(value)}
          onChange={(event) => onChange(event.target.value)}
        >
          {definition.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        {publish && <PublishButton label={definition.label} publish={publish} />}
      </div>
    );
  }

  return (
    <NumberParam
      definition={definition}
      value={Number(value)}
      onChange={onChange}
      locked={locked}
      modulation={modulation}
      publish={publish}
      onRename={onRename}
      control={control}
      pin={pin}
      context={context}
    />
  );
}

interface NumberParamProps extends Omit<ParamControlProps, "definition" | "value"> {
  definition: NumberParamDefinition;
  value: number;
}

/** A knob and its value. Double-clicking the name sets the value back to its default. */
function NumberParam({ definition, value, onChange, locked, modulation, publish, onRename, control, pin, context }: NumberParamProps) {
  const label = fullName(definition.label, context);
  const [menu, setMenu] = useState<Position | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const reset = () => onChange(definition.default, { merge: false });
  const base = locked?.value ?? value;
  const modulated =
    modulation &&
    (() => {
      const added = modulation();
      return added === undefined ? undefined : modulatedValue(definition, base, added);
    });

  return (
    <div
      className={["param", locked && "param-locked", pin?.pinned && "param-pinned"].filter(Boolean).join(" ")}
      onContextMenu={
        pin &&
        ((event) => {
          event.preventDefault();
          setMenu({ x: event.clientX, y: event.clientY });
        })
      }
    >
      <ParamLabel
        label={definition.label}
        title={locked ? undefined : `Double-click to reset to ${formatParam(definition.default, definition)}`}
        onReset={locked ? undefined : reset}
        onRename={onRename}
        context={context}
      />
      <SongKnob
        control={locked ? undefined : control}
        label={label}
        value={value}
        range={definition}
        onChange={onChange}
        format={(numeric) => formatParam(numeric, definition)}
        parse={(text) => parseParam(text, definition)}
        snaps={[definition.default]}
        locked={locked}
        modulated={modulated}
      />
      {publish && <PublishButton label={definition.label} publish={publish} />}
      {pin && menu && <PinMenu label={label} at={menu} pinned={pin.pinned} onToggle={pin.onToggle} onClose={closeMenu} />}
    </div>
  );
}
