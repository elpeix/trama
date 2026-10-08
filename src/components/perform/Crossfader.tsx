import { useContext, useRef } from "react";
import type { ControlKey } from "../../patch/automation";
import { sceneKnobAt } from "../../patch/perform";
import { usePatchStore, usePatchStoreApi } from "../../store/usePatchStore";
import { toSliderPosition } from "../controls/scale";
import { SongControlContext } from "../song/SongControlContext";
import { crossfadeValues } from "./crossfade";

type Side = "a" | "b";

/**
 * A crossfader between two scenes, as on an Octatrack: a scene on each side, picked among the
 * scenes, and a fader that takes each knob they keep from one to the other, without touching the
 * patch. Apply writes what it plays into the patch; with Rec on, a drag records the knobs it moves
 * into the song, as turning each of them would.
 */
export function Crossfader() {
  const song = useContext(SongControlContext);
  const store = usePatchStoreApi();
  const scenes = usePatchStore((state) => state.scenes);
  const crossfader = usePatchStore((state) => state.crossfader);
  const setCrossfader = usePatchStore((state) => state.setCrossfader);
  const applyKnobs = usePatchStore((state) => state.applyKnobs);
  const grabbed = useRef<ControlKey[]>([]);
  const recorder = song?.recorder;

  if (scenes.length === 0) {
    return null;
  }

  const valuesAt = (position: number) =>
    crossfadeValues(store.getState().toPatch(), scenes[crossfader.a ?? -1], scenes[crossfader.b ?? -1], position);

  const placeOf = (key: ControlKey, value: number) => {
    const knob = sceneKnobAt(store.getState().toPatch(), key);
    return knob ? toSliderPosition(value, knob.range) : 0;
  };

  const grab = () => {
    grabbed.current = Object.entries(valuesAt(crossfader.position))
      .filter(([key, value]) => recorder?.grab(key, value, placeOf(key, value)))
      .map(([key]) => key);
  };

  const letGo = () => {
    grabbed.current.forEach((key) => recorder?.release(key));
    grabbed.current = [];
  };

  const move = (position: number) => {
    setCrossfader({ position });
    for (const [key, value] of Object.entries(valuesAt(position))) {
      recorder?.change(key, value, placeOf(key, value));
    }
  };

  const sidePicker = (side: Side) => {
    const picked = crossfader[side];
    return (
      <select
        className="nodrag perform-crossfader-side"
        aria-label={`Scene ${side.toUpperCase()}`}
        value={picked !== undefined && picked < scenes.length ? String(picked) : ""}
        onChange={(event) => setCrossfader({ [side]: event.target.value === "" ? undefined : Number(event.target.value) })}
      >
        <option value="">—</option>
        {scenes.map((scene, index) => (
          <option key={index} value={index}>
            {scene.name ?? `Scene ${index + 1}`}
          </option>
        ))}
      </select>
    );
  };

  return (
    <div className="perform-crossfader" role="group" aria-label="Crossfader">
      <span className="param-label">Crossfader</span>
      {sidePicker("a")}
      <input
        type="range"
        className="nodrag perform-fader"
        aria-label="Crossfader"
        title="Drag from the scene on the left to the one on the right"
        min={0}
        max={1}
        step={0.01}
        value={crossfader.position}
        onPointerDown={grab}
        onPointerUp={letGo}
        onPointerCancel={letGo}
        onChange={(event) => move(Number(event.target.value))}
      />
      {sidePicker("b")}
      <button
        type="button"
        className="hw clip-editor-action perform-crossfader-apply"
        title="Write the values it plays into the patch"
        disabled={crossfader.a === undefined && crossfader.b === undefined}
        onClick={() => applyKnobs(valuesAt(crossfader.position))}
      >
        Apply
      </button>
    </div>
  );
}
