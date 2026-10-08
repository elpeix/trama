import type { PresetNode } from "./presets";
import { formatCurve } from "./sequence";
import { STRING_INSTRUMENTS, type StringInstrument } from "./stringInstruments";
import type { NodeType } from "./types";
import { WIND_INSTRUMENTS, type WindInstrument } from "./windInstruments";

/** A preset that comes with the app: it can be loaded, not deleted nor replaced. */
export interface FactoryPreset {
  name: string;
  node: PresetNode;
}

const wind = (name: string, { body, ...rest }: WindInstrument): FactoryPreset => ({
  name,
  node: { type: "wind", params: { ...rest, body: formatCurve(body, 0.5) } },
});

const strings = (name: string, { body, ...rest }: StringInstrument): FactoryPreset => ({
  name,
  node: { type: "strings", params: { ...rest, body: formatCurve(body, 0.5) } },
});

export const FACTORY_PRESETS: readonly FactoryPreset[] = [
  wind("Flute", WIND_INSTRUMENTS.flute),
  wind("Oboe", WIND_INSTRUMENTS.oboe),
  wind("Clarinet", WIND_INSTRUMENTS.clarinet),
  wind("Horn", WIND_INSTRUMENTS.horn),
  wind("Bassoon", WIND_INSTRUMENTS.bassoon),
  wind("Alto sax", WIND_INSTRUMENTS.sax),
  wind("Alto recorder", WIND_INSTRUMENTS.recorder),
  wind("Pan flute", WIND_INSTRUMENTS.pan),
  wind("Flabiol", WIND_INSTRUMENTS.flabiol),
  wind("Tible", WIND_INSTRUMENTS.tible),
  wind("Tenora", WIND_INSTRUMENTS.tenora),
  wind("Fiscorn", WIND_INSTRUMENTS.fiscorn),
  wind("Trumpet", WIND_INSTRUMENTS.trumpet),
  wind("Trombone", WIND_INSTRUMENTS.trombone),
  strings("Violin", STRING_INSTRUMENTS.violin),
  strings("Viola", STRING_INSTRUMENTS.viola),
  strings("Cello", STRING_INSTRUMENTS.cello),
  strings("Double bass", STRING_INSTRUMENTS.bass),
];

/** The presets that come with the app for a type of module, in the order they are shown. */
export const factoryPresetsOf = (type: NodeType): readonly FactoryPreset[] => FACTORY_PRESETS.filter(({ node }) => node.type === type);
