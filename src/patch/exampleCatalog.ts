export const EXAMPLE_CATEGORIES = [
  { id: "start", label: "First steps" },
  { id: "instruments", label: "Instruments" },
  { id: "sequencing", label: "Sequencing" },
  { id: "modulation", label: "Modulation" },
  { id: "effects", label: "Effects" },
  { id: "sources", label: "Sources & filters" },
  { id: "patching", label: "Patching" },
  { id: "pieces", label: "Pieces" },
] as const;

/** An example patch of the app: its file in examples/, and what the menu says of it. */
export interface Example {
  id: string;
  category: (typeof EXAMPLE_CATEGORIES)[number]["id"];
  title: string;
  description: string;
  /** What it takes to hear it besides starting the audio; nothing when it plays on its own. */
  needs?: "keys" | "microphone" | "midi";
}

export const EXAMPLES: readonly Example[] = [
  {
    id: "01-basic-synth",
    category: "start",
    title: "Basic synth",
    description: "A subtractive synth with an envelope on the volume and the filter",
    needs: "keys",
  },
  {
    id: "07-scope-synth",
    category: "start",
    title: "Scope synth",
    description: "The basic synth with four scopes: the oscillator, the filter, the sound out and the envelope",
    needs: "keys",
  },
  {
    id: "02-echo-pluck",
    category: "start",
    title: "Echo pluck",
    description: "A plucked note with a delay",
    needs: "keys",
  },
  {
    id: "04-vibrato-lead",
    category: "start",
    title: "Vibrato lead",
    description: "A square wave with vibrato",
    needs: "keys",
  },
  {
    id: "51-violin",
    category: "instruments",
    title: "Violin",
    description:
      "A bowed violin from the keys: one saw string through the body of a violin, bow noise, and a vibrato an envelope brings in after the attack",
    needs: "keys",
  },
  {
    id: "50-piano",
    category: "instruments",
    title: "Piano",
    description:
      "A slow piece in A minor on the Piano: broken chords in the left hand and a melody in the right, each note as hard as it is played, so louder and brighter, in a hall",
  },
  {
    id: "56-midi-piano",
    category: "instruments",
    title: "MIDI piano",
    description: "The Piano played from a MIDI keyboard, as hard as each key is struck, with the sustain pedal on its Pedal, in a hall",
    needs: "midi",
  },
  {
    id: "53-wind",
    category: "instruments",
    title: "Clarinet and oboe",
    description:
      "A clarinet melody in G minor on a Wind with a reed on a cylinder, and an oboe line above it on a Wind with a double reed on a cone and its body drawn: notes played while the one before is still held slur to it, the others are tongued, and each is blown as hard as it is played",
  },
  {
    id: "54-strings",
    category: "instruments",
    title: "Strings",
    description:
      "A violin melody in D major on a Strings drawn by the bow, the notes held into the next slurred without lifting it and the others bowed anew, over a cello plucked on a Strings played pizzicato, in a hall",
  },
  {
    id: "45-303",
    category: "instruments",
    title: "303",
    description:
      "A bass line machine in a subpatch, played from its face: the steps and four patterns of a Seq, and its cutoff, resonance, decay and slide",
  },
  {
    id: "44-808",
    category: "instruments",
    title: "808",
    description:
      "A drum machine in a subpatch, played from its face: the rows and four patterns of a Drums, and the knobs of each drum in sections",
  },
  {
    id: "12-plucked-strings",
    category: "instruments",
    title: "Plucked strings",
    description: "A harp and a nylon bass from the Physical Model, with no ADSR nor Gain",
  },
  {
    id: "48-modal",
    category: "instruments",
    title: "Modal",
    description:
      "Tubular bells on a slow melody and a marimba on an arpeggio, each struck by a gate and ringing with the partials of its model, in a hall",
  },
  {
    id: "17-harmonics",
    category: "instruments",
    title: "Harmonics",
    description: "An organ melody in D minor from the Harmonics, with two slow LFOs on Bright and Even",
  },
  {
    id: "32-sampler",
    category: "instruments",
    title: "Sampler",
    description: "A marimba sample played on each note of a Seq in C minor pentatonic; the sample comes with it",
  },
  {
    id: "49-samples",
    category: "instruments",
    title: "Samples",
    description:
      "Drums from samplers of several samples, made in the file: hats that take one of three at random on every hit, and four snares that a slow LFO picks through Select",
  },
  {
    id: "22-poly",
    category: "instruments",
    title: "Poly",
    description: "A four-voice pad in a subpatch: play chords on the keys",
    needs: "keys",
  },
  {
    id: "09-sequencer",
    category: "sequencing",
    title: "Sequencer",
    description: "A 16-step bass line through a resonant filter",
  },
  {
    id: "08-arpeggio",
    category: "sequencing",
    title: "Arpeggio",
    description: "A two-octave up and down arpeggio with a filter and a delay; hold two or three keys",
    needs: "keys",
  },
  {
    id: "16-clip",
    category: "sequencing",
    title: "Clip",
    description: "A four-bar melody in A minor with notes of different lengths, drawn on the piano roll of a Clip",
  },
  {
    id: "55-waltz",
    category: "sequencing",
    title: "Waltz",
    description: "A waltz in 3/4: a bass on the first beat of each bar and chords on the other two, under a melody",
  },
  {
    id: "15-patterns",
    category: "sequencing",
    title: "Patterns",
    description: "A bass and an arpeggio with four patterns each, A1 to A4 (Am, F, C, G): double-click one to launch it",
  },
  {
    id: "23-chords",
    category: "sequencing",
    title: "Chords",
    description: "The chords of a Clip (Am, F, C, G) on the four-voice pad",
  },
  {
    id: "24-seq-chords",
    category: "sequencing",
    title: "Seq chords",
    description: "A Seq in A minor playing triads on eight voices, whose long tails overlap",
  },
  {
    id: "30-clock",
    category: "sequencing",
    title: "Clock",
    description: "One Clock plucks on eighths, and another changes the note every three sixteenths: three against two",
  },
  {
    id: "33-clock-input",
    category: "sequencing",
    title: "Clock input",
    description: "A low Seq, and a Clock dividing its notes by three to step a Seq of five steps",
  },
  {
    id: "29-quantizer",
    category: "sequencing",
    title: "Quantizer",
    description: "Random values rounded to A minor pentatonic: a melody that never leaves the scale",
  },
  {
    id: "03-wobble-bass",
    category: "modulation",
    title: "Wobble bass",
    description: "A bass with an LFO on the resonant filter, synced to eighths",
    needs: "keys",
  },
  {
    id: "05-siren-echo",
    category: "modulation",
    title: "Siren echo",
    description: "A siren made with an LFO, and an echo",
    needs: "keys",
  },
  {
    id: "36-math",
    category: "modulation",
    title: "Math",
    description: "A Math multiplies the envelope of each note by an LFO: the filter shakes on the attack and calms down",
  },
  {
    id: "37-slew",
    category: "modulation",
    title: "Slew",
    description: "A melody with big leaps through a Slew: notes rise almost at once and slide down",
  },
  {
    id: "28-sample-hold",
    category: "modulation",
    title: "Sample & Hold",
    description: "A saw line in D minor with a Sample & Hold moving the resonant filter at random",
  },
  {
    id: "38-envelope-follower",
    category: "modulation",
    title: "Envelope Follower",
    description: "A kick ducks a pad on each hit through an Envelope Follower, like a sidechain",
  },
  {
    id: "35-velocity",
    category: "modulation",
    title: "Velocity",
    description: "A Clip line of loud, medium and soft notes, where the velocity opens the VCA and the filter",
  },
  {
    id: "19-acid",
    category: "modulation",
    title: "Acid",
    description: "A bass line in the style of the 303: ties, and accents opening the filter and the Gain",
  },
  {
    id: "26-reverb",
    category: "effects",
    title: "Reverb",
    description: "A plucked melody in A minor inside a 4.5 s room, with a slow LFO on the tone of the tail",
  },
  {
    id: "27-distortion",
    category: "effects",
    title: "Distortion",
    description: "A bass in A minor through two Distortions: a fold with an LFO on the Drive, and a drawn curve",
  },
  {
    id: "40-chorus",
    category: "effects",
    title: "Chorus",
    description: "Slow saw chords in A minor made wide by a three-voice Chorus, in a room",
  },
  {
    id: "41-flanger",
    category: "effects",
    title: "Flanger",
    description: "A saw bass line in E minor through a Flanger with feedback, sweeping slowly like a jet",
  },
  {
    id: "42-phaser",
    category: "effects",
    title: "Phaser",
    description: "A square-wave melody in D minor through a six-stage Phaser, with an echo",
  },
  {
    id: "39-compressor",
    category: "effects",
    title: "Compressor",
    description: "A kick and a noise hi-hat through a Compressor, brought back up by its makeup",
  },
  {
    id: "13-harmonizer",
    category: "effects",
    title: "Harmonizer",
    description: "A melody in A minor pentatonic, doubled a fifth up by the Pitch Shifter",
  },
  {
    id: "14-frozen-pads",
    category: "effects",
    title: "Frozen pads",
    description: "An A minor seventh arpeggio frozen once a bar by the Spectral Freeze into a pad",
  },
  {
    id: "18-grains",
    category: "effects",
    title: "Grains",
    description: "Plucks of the Physical Model turned into a cloud an octave up by a Granulator",
  },
  {
    id: "20-stereo",
    category: "effects",
    title: "Stereo",
    description: "An arpeggio moved from side to side by a Pan, and a stereo cloud of the Granulator",
  },
  {
    id: "46-vco",
    category: "sources",
    title: "VCO",
    description:
      "A supersaw pad of seven detuned voices, a bass whose pulse width an LFO moves, and a voice in hard sync with it, swept by its envelope",
  },
  {
    id: "47-ladder",
    category: "sources",
    title: "Ladder",
    description:
      "A saw bass through the 24 dB low-pass of a Moog, driven into saturation: the envelope opens it on each note, and the accents make it ring",
  },
  {
    id: "11-drawn-waves",
    category: "sources",
    title: "Drawn waves",
    description: "A bass of drawn harmonics, and an arpeggio through a drawn Custom Filter, with an echo",
  },
  { id: "06-wind", category: "sources", title: "Wind", description: "Wind made of filtered noise" },
  {
    id: "31-audio-input",
    category: "sources",
    title: "Audio input",
    description: "The microphone, doubled a fifth up by the Pitch Shifter, in a Reverb",
    needs: "microphone",
  },
  {
    id: "21-subpatch",
    category: "patching",
    title: "Subpatch",
    description: "A whole voice (oscillator, filter, ADSR and VCA) inside a subpatch, played by a Seq",
  },
  {
    id: "52-nested-outs",
    category: "patching",
    title: "Nested outs",
    description:
      "An LFO in a subpatch inside a subpatch, taken out through an Out at each level: it sweeps the filter of the voice and draws itself on a Scope at the top",
  },
  {
    id: "10-mixer",
    category: "patching",
    title: "Mixer",
    description: "A bass, an arpeggio with a rhythm and an echo, and a noise hi-hat, each on a channel of the Mixer",
  },
  {
    id: "43-song",
    category: "pieces",
    title: "Techno song",
    description:
      "A 64-bar techno track in F minor at 126 BPM: open the song panel and play it in song mode, with four patterns each on the drums, the bass, the arp, the pads and the lead, mutes and filter sweeps",
  },
  {
    id: "34-acid-techno",
    category: "pieces",
    title: "Acid techno",
    description: "A track at 132 BPM with drums, two 303s and chords: launch patterns A2 and A3 to bring them all in",
  },
];

const files = import.meta.glob<unknown>("../../examples/*.json", { import: "default" });

/** Reads the file of an example, fetched only when asked for. */
export async function loadExample(id: string): Promise<unknown> {
  const file = files[`../../examples/${id}.json`];
  if (!file) {
    throw new Error(`There is no example "${id}"`);
  }
  return file();
}
