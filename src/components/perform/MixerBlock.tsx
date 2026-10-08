import { useContext } from "react";
import { controlKey } from "../../patch/automation";
import type { PerformMixer } from "../../patch/perform";
import { usePatchStore } from "../../store/usePatchStore";
import { ParamLabel } from "../controls/ParamControl";
import { parseParam } from "../controls/scale";
import { ChannelControls } from "../displays/MixerDisplay";
import { LEVEL_RANGE } from "../displays/level";
import { LevelMeter } from "../displays/LevelMeter";
import { EngineContext } from "../EngineContext";
import { SongKnob } from "../song/SongKnob";

interface MixerBlockProps {
  item: PerformMixer;
  name: string;
  context?: string;
  onRename: (name: string) => void;
}

/**
 * A mixer pinned, laid out like a desk: a column for each channel it has, with its level, its pan,
 * its mute and solo and a meter, and one for the level of everything it sends out.
 */
export function MixerBlock({ item, name, context, onRename }: MixerBlockProps) {
  const engine = useContext(EngineContext);
  const setChannel = usePatchStore((state) => state.setChannel);
  const setKnob = usePatchStore((state) => state.setKnob);
  const { key, label, level, channels } = item;
  const main = `${label} › Main`;

  return (
    <div className="perform-mixer" role="group" aria-label={label}>
      <ParamLabel label={name} context={context} onRename={onRename} />
      <div className="perform-mixer-columns">
        {channels.map((channel) => {
          const full = `${label} › ${channel.label}`;
          return (
            <div key={channel.key} className="perform-mixer-column" role="group" aria-label={channel.label}>
              <span className="param-label perform-mixer-name" title={channel.label}>
                {channel.label}
              </span>
              <div className="perform-mixer-controls">
                <ChannelControls
                  label={full}
                  level={channel.level}
                  pan={channel.pan}
                  mute={channel.mute}
                  solo={channel.solo}
                  onLevel={(value, options) => setChannel(channel.key, "level", value, options)}
                  onPan={(value, options) => setChannel(channel.key, "pan", value, options)}
                  onSwitch={(control, on) => setChannel(channel.key, control, on ? 1 : 0)}
                  control={(control) => controlKey(channel.key, control)}
                >
                  <LevelMeter label={`${full} signal`} read={() => engine?.getProbe(key, channel.key)} />
                </ChannelControls>
              </div>
            </div>
          );
        })}
        <div className="perform-mixer-column perform-mixer-main" role="group" aria-label="Main">
          <span className="param-label perform-mixer-name">Main</span>
          <div className="perform-mixer-controls">
            <SongKnob
              control={controlKey(key, "level")}
              label={main}
              value={level}
              range={LEVEL_RANGE}
              onChange={(value, options) => setKnob(controlKey(key, "level"), value, options)}
              format={(value) => value.toFixed(2)}
              parse={(text) => parseParam(text, {})}
              snaps={[1]}
            />
            <LevelMeter label={`${main} signal`} read={() => engine?.getAnalyser(key)} />
          </div>
        </div>
      </div>
    </div>
  );
}
