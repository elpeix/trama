import type { ControlKey } from "../../patch/automation";
import { sceneKnobAt } from "../../patch/perform";
import type { Graph, Scene } from "../../patch/types";
import { fromSliderPosition, toSliderPosition } from "../controls/scale";

/**
 * The value of each knob the scenes on the two sides of the crossfader keep, at `position` from A
 * (0) to B (1), going along the turn of the knob; a side without a scene, or without the knob,
 * gives the value of the patch.
 */
export function crossfadeValues(graph: Graph, a: Scene | undefined, b: Scene | undefined, position: number): Record<ControlKey, number> {
  const keys = new Set([...Object.keys(a?.knobs ?? {}), ...Object.keys(b?.knobs ?? {})]);
  return Object.fromEntries(
    [...keys].flatMap((key): [ControlKey, number][] => {
      const knob = sceneKnobAt(graph, key);
      if (!knob) {
        return [];
      }
      const from = toSliderPosition(a?.knobs?.[key] ?? knob.value, knob.range);
      const to = toSliderPosition(b?.knobs?.[key] ?? knob.value, knob.range);
      return [[key, fromSliderPosition(from + (to - from) * position, knob.range)]];
    }),
  );
}
