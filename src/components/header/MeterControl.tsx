import { meterLabel, METERS, sameMeter } from "../../patch/meter";
import { usePatchStore } from "../../store/usePatchStore";

/** The meter of the patch, on a display like the tempo's: the beats of a bar, in groups. */
export function MeterControl() {
  const meter = usePatchStore((state) => state.meter);
  const setMeter = usePatchStore((state) => state.setMeter);
  const meters = METERS.some((known) => sameMeter(known, meter)) ? METERS : [...METERS, meter];

  return (
    <div className="tempo-screen meter-screen">
      <select
        className="tempo-value meter-value"
        aria-label="Meter"
        title="Meter: the beats of a bar, in groups"
        value={meterLabel(meter)}
        onChange={(event) => setMeter(meters.find((known) => meterLabel(known) === event.target.value)!)}
      >
        {meters.map((known) => (
          <option key={meterLabel(known)} value={meterLabel(known)}>
            {meterLabel(known)}
          </option>
        ))}
      </select>
    </div>
  );
}
