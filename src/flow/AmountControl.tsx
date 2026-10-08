import { parseParam } from "../components/controls/scale";
import { SongKnob } from "../components/song/SongKnob";
import type { ControlKey } from "../patch/automation";

const AMOUNT_RANGE = { min: -1, max: 1, step: 0.01, scale: "linear" } as const;

interface AmountControlProps {
  value: number;
  onChange: (value: number, options?: { merge?: boolean }) => void;
  /** The control of the song it is, so that Rec records it into the song. */
  control?: ControlKey;
}

/**
 * How much of a control signal reaches its param, from -1 (inverted) to 1, on a small knob that
 * works like the knobs of the modules. A drag snaps to 0, which turns the modulation off, and to
 * 1, where a cable starts; Alt turns the snap off.
 */
export function AmountControl({ value, onChange, control }: AmountControlProps) {
  return (
    <div className="amount-control">
      <SongKnob
        control={control}
        label="Amount"
        value={value}
        range={AMOUNT_RANGE}
        onChange={onChange}
        format={(amount) => amount.toFixed(2)}
        parse={(text) => parseParam(text, {})}
        snaps={[1]}
      />
    </div>
  );
}
