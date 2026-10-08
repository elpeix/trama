import { useCallback, useContext, useState, type ReactNode } from "react";
import { EngineContext } from "../EngineContext";
import type { ChannelControl, ControlKey } from "../../patch/automation";
import { SongKnob, SongSwitch } from "../song/SongKnob";
import { LEVEL_RANGE } from "./level";
import { LevelMeter } from "./LevelMeter";
import { parseParam } from "../controls/scale";
import { formatPan, parsePan } from "./pan";
import { PinMenu } from "../controls/PinMenu";
import type { Position } from "../../patch/types";

const PAN_RANGE = { min: -1, max: 1, step: 0.01, scale: "linear" } as const;

export interface MixerChannel {
  /** The cable that brings the signal. */
  id: string;
  label: string;
  level: number;
  pan: number;
  mute: boolean;
  solo: boolean;
}

interface MixerDisplayProps {
  nodeId: string;
  channels: MixerChannel[];
  onLevel: (id: string, level: number, options?: { merge?: boolean }) => void;
  onPan: (id: string, pan: number, options?: { merge?: boolean }) => void;
  onSwitch: (id: string, name: "mute" | "solo", on: boolean) => void;
  /** The control of the song each setting of a channel is, by the cable of the channel. */
  control?: (id: string, name: ChannelControl) => ControlKey;
  /** Pins the whole mixer to the perform panel from the menu of a right click on a channel, marked while it is. */
  pin?: { pinned: boolean; onToggle: () => void; label: string };
}

interface ChannelControlsProps {
  label: string;
  level: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  onLevel: (level: number, options?: { merge?: boolean }) => void;
  onPan: (pan: number, options?: { merge?: boolean }) => void;
  onSwitch: (name: "mute" | "solo", on: boolean) => void;
  /** The control of the song each setting of the channel is. */
  control?: (name: ChannelControl) => ControlKey;
  /** What goes between the pan and the switches, such as a meter. */
  children?: ReactNode;
}

/** The level and pan knobs of a mixer channel and its mute and solo, each also a control of the song. */
export function ChannelControls({ label, level, pan, mute, solo, onLevel, onPan, onSwitch, control, children }: ChannelControlsProps) {
  return (
    <>
      <SongKnob
        control={control?.("level")}
        label={`${label} level`}
        value={level}
        range={LEVEL_RANGE}
        onChange={onLevel}
        format={(value) => value.toFixed(2)}
        parse={(text) => parseParam(text, {})}
        snaps={[1]}
      />
      <SongKnob
        control={control?.("pan")}
        label={`${label} pan`}
        value={pan}
        range={PAN_RANGE}
        onChange={onPan}
        format={formatPan}
        parse={parsePan}
        snaps={[0]}
      />
      {children}
      <SongSwitch control={control?.("mute")} on={mute} onFlip={(on) => onSwitch("mute", on)}>
        {(pressed, flip) => (
          <button
            type="button"
            className="mixer-switch mixer-mute nodrag"
            aria-label={`Mute ${label}`}
            aria-pressed={pressed}
            title="Mute"
            onClick={flip}
          >
            M
          </button>
        )}
      </SongSwitch>
      <SongSwitch control={control?.("solo")} on={solo} onFlip={(on) => onSwitch("solo", on)}>
        {(pressed, flip) => (
          <button
            type="button"
            className="mixer-switch mixer-solo nodrag"
            aria-label={`Solo ${label}`}
            aria-pressed={pressed}
            title="Solo: while a channel is in solo, only the channels in solo sound"
            onClick={flip}
          >
            S
          </button>
        )}
      </SongSwitch>
    </>
  );
}

/** A row per cable: its source, the level and pan of its channel, a meter of what goes through it, and mute and solo. */
export function MixerDisplay({ nodeId, channels, onLevel, onPan, onSwitch, control, pin }: MixerDisplayProps) {
  const engine = useContext(EngineContext);
  const [menu, setMenu] = useState<Position | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);

  if (channels.length === 0) {
    return <p className="mixer-empty">Connect sounds to mix them</p>;
  }

  return (
    <ul className="mixer" aria-label="Channels">
      {channels.map(({ id, label, level, pan, mute, solo }) => (
        <li
          key={id}
          className={pin?.pinned ? "mixer-channel mixer-channel-pinned" : "mixer-channel"}
          onContextMenu={
            pin &&
            ((event) => {
              event.preventDefault();
              setMenu({ x: event.clientX, y: event.clientY });
            })
          }
        >
          <span className="mixer-channel-label" title={label}>
            {label}
          </span>
          <ChannelControls
            label={label}
            level={level}
            pan={pan}
            mute={mute}
            solo={solo}
            onLevel={(value, options) => onLevel(id, value, options)}
            onPan={(value, options) => onPan(id, value, options)}
            onSwitch={(name, on) => onSwitch(id, name, on)}
            control={control && ((name) => control(id, name))}
          >
            <LevelMeter label={`${label} signal`} orientation="horizontal" read={() => engine?.getProbe(nodeId, id)} />
          </ChannelControls>
        </li>
      ))}
      {pin && menu && (
        <PinMenu label={pin.label} at={menu} pinned={pin.pinned} onToggle={pin.onToggle} onClose={closeMenu} />
      )}
    </ul>
  );
}
