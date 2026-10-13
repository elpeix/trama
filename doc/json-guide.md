# Trama — Guide to writing songs in JSON

This guide explains how to write by hand, or have an AI write, a Trama patch
file that plays as a song: instruments, patterns, and the order they play in, bar
by bar. Load the file with the **Load** button in the top bar. To hear the song,
open the **Song** panel, pick **Song** next to **Play**, and press Play.

Everything here was checked against the code: the names, ranges and formats are
the ones the app accepts. The example at the end loads and plays.

## Instructions for the AI

If you hand this guide to an AI, these are the rules it must not break:

1. Answer with **a single JSON object**, with no comments or text around it.
2. Use only the module types, ports and params of the
   [reference](#module-reference). Names are case-sensitive (`Q`, not `q`).
3. Every number must be within its range. A single value out of range makes the
   file **fail to load**.
4. Step and rhythm texts have **exactly 16** words, even when `length` is
   shorter.
5. Every cable joins an **output** to an **input of the same type** (`audio`,
   `control`, `trigger`, `notes`). No loops.
6. Every node `id` is unique. Every cable `id` is `"source:port->target:port"`.
7. Every sound must end up at an `output`, usually through a `mixer`.

## File structure

```json
{
  "version": 1,
  "tempo": 124,
  "swing": 54,
  "nodes": [],
  "connections": [],
  "song": { "bars": 16, "rows": {} }
}
```

| Field         | Required | What it is                                                     |
| ------------- | -------- | -------------------------------------------------------------- |
| `version`     | yes      | Always `1`                                                     |
| `tempo`       | yes      | BPM, in quarter notes, from 30 to 300                          |
| `swing`       | no       | From 50 (straight) to 75; delays every other step of the grid  |
| `swingGrid`   | no       | What the swing delays: `"1/16"` (by default) or `"1/8"`        |
| `meter`       | no       | The time signature; 4/4 without it                             |
| `nodes`       | yes      | The modules                                                    |
| `connections` | yes      | The cables                                                     |
| `song`        | no       | The order of the patterns bar by bar, and the knobs it moves   |
| `meta`        | no       | The title, author, description and link of the piece           |

`meta` has four text fields, all optional: `title` (up to 80 characters),
`author` (80), `description` (500) and `link` (300, `http://` or `https://`
only). The title shows on the bar and on the browser tab, and names the file when
it is saved:

```json
"meta": {
  "title": "Rain on the window",
  "author": "Francesc",
  "description": "A sad lo-fi in D minor"
}
```

`meter` is a list of groups of quarter beats, `[3]` for 3/4 or `[3, 2]` for
3+2/4, or an even number of groups of three eighths, `{ "eighths": [3, 3] }` for
6/8 and `{ "eighths": [3, 3, 3, 3] }` for 12/8. A bar has up to 16 beats. The
app offers 2/4 `[2]`, 3/4 `[3]`, 4/4 `[4]`, 3+2/4, 2+3/4, 6/4 `[6]`, 4+3/4,
3+4/4, 2+2+3/4, 6/8 and 12/8. A **beat is always a quarter note**, also in 6/8:
a bar of 3/4 or 6/8 has 3 beats, one of 12/8 has 6. `tempo`, clip notes and
song automation count these beats.

The swing delays the steps of the Arp, the Seq and the Drums that fall between
two eighths (`swingGrid` `"1/16"`) or between two beats (`"1/8"`, the jazz
swing), and the notes of a Clip on those places. At 67 it sounds like a triplet.

There are other optional fields (`perform`, `hiddenLaunchers`, `scenes`, and
`samples` for Samplers) that a song does not need.

### Nodes

```json
{
  "id": "sequencer-13",
  "type": "sequencer",
  "name": "Bass",
  "position": { "x": 0, "y": 1400 },
  "params": { "octave": -2, "steps": "A4 - A4 - C5 - A4 - D5 - C5 - G4 - E4 -" },
  "patterns": { "A2": { "steps": "F4 - F4 - A4 - F4 - G4 - G4 - E4 - D4 -" } }
}
```

- **`id`**: unique in the whole patch. By convention, the type, a dash and a
  number never used before (`oscillator-2`, `gain-4`). Songs and cables refer to
  nodes by this `id`.
- **`type`**: one of the types in the reference.
- **`name`** (optional): up to 40 characters. It shows in the header of the
  module, on the Mixer channels and on the rows of the song. Give every
  instrument one: it makes the song much easier to read.
- **`position`**: where the module is drawn in the editor, in pixels. It does
  not change the sound. Keep modules about 350 px apart horizontally and 250
  vertically so they do not overlap.
- **`params`**: the params. Those left out take their default; unknown ones are
  ignored; those present and not valid stop the file from loading.
- **`patterns`** (optional, Seq, Arp, Clip and Drums only): see
  [Patterns](#patterns).

### Cables

```json
{
  "id": "sequencer-13:pitch->oscillator-14:detune",
  "source": { "nodeId": "sequencer-13", "port": "pitch" },
  "target": { "nodeId": "oscillator-14", "port": "detune" },
  "amount": 1
}
```

- **Port types**: `audio` (sound), `control` (a value that moves a param),
  `trigger` (the gate of a note: open while the note plays) and `notes` (notes one
  by one, with their velocity, for the Piano, the Wind, the Strings and
  polyphonic subpatches). Only ports of the same type connect.
- **Modulatable params**: every param marked as modulatable in the reference is
  also a **control input** with the same name. A control cable **adds** to the
  value of the param.
- **`amount`** (optional, from −1 to 1, 1 by default): on a control cable, how
  much of the signal gets through; a negative one inverts it.
- **Mixer channels**: every cable into the `audio` input of a `mixer` is a
  channel. On that cable, `amount` is the **level** of the channel (0 to 1),
  `pan` its place (−1 left, 0 centre, 1 right), and `mute` and `solo` are `true`
  or `false`.
- An input can take several cables (the Mixer makes them channels; the others
  add them up). An output can go to several places.

## How a note sounds

The sequencers (`sequencer`, `arpeggiator`, `clip`, `keyboard`, `midiInput`) make no sound:
they send two things that must be connected to a voice.

- **`pitch`** (control) is the pitch of the note in **octaves from C4**: 0 is
  C4, 1 is C5, −1 is C3. It goes to the **`detune`** of an `oscillator` set to
  **`"mode": "keyboard"`**. In that mode the oscillator is tuned to C4 and
  `detune` moves it (an `amount` of 1 gives 1200 cents per octave, in tune).
- **`gate`** (trigger) opens on every note. It goes to the `gate` of an
  `envelope` (ADSR).

The smallest voice is:

```text
sequencer.pitch  -> oscillator.detune   (oscillator: mode "keyboard")
sequencer.gate   -> envelope.gate
oscillator.audio -> gain.audio          (gain: "gain": 0)
envelope.out     -> gain.gain           (a Gain at 0 is a VCA: the ADSR opens it)
gain.audio       -> mixer.audio
mixer.audio      -> output.audio
```

A `gain` with `"gain": 0` and the ADSR on its `gain` input is a **VCA**: it lets
the sound through only while the note plays. Without it, the oscillator would
sound all the time. A `filter` between the oscillator and the VCA, with the ADSR
on the filter's `frequency` too (`amount` 0.3 to 0.7), gives the classic synth
sound.

An oscillator is **a single voice**: do not connect two sequencers to the same
oscillator, as their pitches would add up. Each part (bass, melody, arpeggio)
has its own chain: oscillator, ADSR and VCA. The `vco` and the `harmonics` are
played the same way.

The `physicalModel` and the `modal` sound on their own when struck: with
`"mode": "keyboard"`, the `pitch` goes to their `detune` and the `gate` to their
`gate`, with no ADSR or VCA.

The `piano`, the `wind` and the `strings` are played by **notes**: the `notes`
output of a `sequencer`, a `clip` or a `keyboard` goes to their `notes` input,
and that is all; they need no ADSR or VCA. The Piano plays chords; the Wind and
the Strings play one note at a time, so give them a melody, not chords.

```text
clip.notes  -> piano.notes
piano.audio -> mixer.audio
```

### Drum recipes

The `drums` has one gate output per piece (`kick`, `snare`, `clap`, `rim`,
`lowtom`, `hightom`, `hat`, `open`). Each one triggers the ADSR of a voice:

- **Kick**: `oscillator` with `sine`, `mode` `free`, `frequency` 50–60, into a
  VCA. ADSR with `attack` 0.001, `decay` 0.2–0.3, `sustain` 0, `release` 0.05,
  `curve` `exp`. The same ADSR on the oscillator's `detune` (`amount` 1) gives
  the typical pitch drop.
- **Snare**: `noise` → `filter` `bandpass` at 1500–2000 Hz → VCA, with an `exp`
  ADSR with `decay` 0.1–0.15.
- **Hi-hat**: `noise` → `filter` `highpass` at 6000–8000 Hz → VCA, with a very
  short `exp` ADSR (`decay` 0.03–0.06). The open hat, the same with `decay` 0.3.
- **Clap**: `noise` → `filter` `bandpass` at about 1800 Hz → VCA, with an ADSR
  with `curve` `clap`: three quick hits, each about `spread` seconds long, before
  its attack and decay. `release` 0.15 gives the tail.
- **Toms**: like the kick, with the `oscillator` at about 100 Hz for the low
  one and about 160 Hz for the high one.

### Effects and mixing

Put effects between the VCA and the Mixer: `delay` (with `sync` at `3/16` or
`1/8` it follows the tempo), `reverb`, `chorus`, `distortion`. Set the level of
each part with the `amount` of its Mixer channel, and the final volume with the
`volume` of the `output` (0.7–0.8 leaves headroom).

## Text formats

### Notes

A note name is a letter from `C` to `B`, an optional `#` and the octave: `C4`,
`D#3`, `A5`. There are no flats: write `A#`, not `Bb`. `C4` is middle C.

### Seq steps

`steps` has **exactly 16 words**, one per step (sixteenths with `division`
`1/16`), separated by a space:

- A note (`C4`): the step plays it.
- `-`: silence.
- `!` after the note: an accent (`C4!`), sent on the `accent` output.
- `_`: a tie that holds the note before it one more step.
- `_` before a note: legato into that note, gliding over `glide`.
- `?` and a percentage at the end: the chance of playing (`C4?50`).

Notes must be from **C4 to B6**. To play lower or higher, use `octave` (−3 to
3): a bass is written between C4 and C5 with `"octave": -2`. If `length` is
under 16, the extra steps do not play, but they must be there.

The steps loop over `length` whatever the meter. Sixteen sixteenths are a bar of
4/4; in 3/4 or 6/8, a `length` of 12 at `1/16` lasts one bar, and in 12/8 a
`length` of 12 at `1/8` does. The same goes for the Drums and the Arp.

`root` and `scale` set the key of the grid in the editor. They change no note,
but the notes are best kept inside them.

### Rhythms

The rows of the Drums (`kick`, `snare`, `clap`, `rim`, `lowtom`, `hightom`,
`hat`, `open` and `accent`) and `rhythm` of the Arp have **exactly 16 words**:
`x` for a step that plays and `-` for one that stays silent. Only on the Drums,
`x?25` plays one time in four, on average, and `x2`, `x3` and `x4` play two,
three or four times within the step, for rolls; they combine with the chance
(`x3?50`). The Arp plays every `x` once.

```text
kick:  x - - - x - - - x - - - x - - -    (quarters: four on the floor)
snare: - - - - x - - - - - - - x - - -    (beats 2 and 4)
hat:   - - x - - - x - - - x - - - x -    (offbeats)
```

### Arp notes

With `"source": "notes"`, the Arp plays the notes of `notes` on its own, one at
a time: names separated by a space, from **C4 to C5** (`"C4 E4 A4"`). `pattern`
picks the order, `span` repeats them up to 3 octaves up, `octave` moves them,
and `rhythm` says which steps play. Without `"source": "notes"`, the Arp only
plays with the computer keys.

### Clip notes

`notes` is a list of `note@start+length`, with the start and the length in beats
(quarter notes: 4 per bar in 4/4, 3 in 3/4 and 6/8) and `v` with the velocity
(1–127) when it is not 100: `"A4@0+1 C5@1+0.5 E5@1.5+2.5v90"`. Notes go from C1
to C7; a note starts before beat 64 and lasts up to 64 beats. `bars` (1 to 16)
is the length of the loop in bars of the meter; notes that start beyond it do
not play. Notes that start together make a chord on `notes`; on `pitch` it is
monophonic: when two notes overlap, the new one plays.

## Patterns

The Seq, the Arp, the Clip and the Drums have 32 patterns, from **A1** to **D8**
(four banks of eight). **A1** is what is in `params`. The others go in
`patterns`, and they only need **the pattern params that change**; the rest is
copied from A1:

```json
"patterns": {
  "A2": { "steps": "F4 - F4 - A4 - F4 - G4 - G4 - E4 - D4 -" },
  "A3": { "steps": "C5 - - - C5 - A4 - G4 - - - E4 - - -", "length": 16 }
}
```

The pattern params of each module are in the reference. The others (`gate`,
`octave`, `division`…) belong to the node and do not change with the pattern.

## The song

```json
"song": {
  "bars": 16,
  "rows": {
    "drums-1": "A1 - - - - - - - A2 - - - - - - -",
    "sequencer-13": "A1 - - - A2 - - - A1 - - - A2 - - -"
  },
  "loop": { "start": 0, "length": 4 },
  "fade": 2,
  "automation": {
    "filter-15.frequency": "0:300 32:450 36:650 40:900 44:1200",
    "delay-22:audio->mixer-23:audio.mute": "0:1 16:0"
  }
}
```

- **`bars`**: bars of the song, from 1 to 999. A bar has the beats of the
  `meter`: 4 in 4/4, 3 in 3/4 and 6/8, 6 in 12/8.
- **`rows`**: a row per node with patterns, by its `id`. One word per bar: a
  pattern (`A1`…`D8`), `-`, which means "go on with what plays", or `.`, which
  silences the node from that bar until the next pattern. A row cannot have
  more words than `bars`; with fewer, the rest are `-`. A pattern that
  already plays does not start over, so a four-bar Clip with `"A1 - - -"` plays
  whole.
- **`loop`** (optional): repeats endlessly the bars from `start` (counted from 0)
  over `length`. With a loop, the song never ends.
- **`fade`** (optional): last bars over which the volume goes down to silence.
  A whole number from 1 to `bars`. Without a loop, the song stops at the end of
  its last bar.
- **`automation`** (optional): knobs moved along the song. The key is
  `"node-id.param"`, for a Mixer channel `"cable-id.level"`, `.pan`, `.mute` or
  `.solo`, and for a control cable `"cable-id.amount"`, from −1 to 1. Only
  number params can be automated. The value is a list of `beat:value` from the
  start of the song, in beats of the meter (4 per bar in 4/4). At each point the
  knob goes there at once and stays until the next point. With `~` instead of
  `:`, the knob reaches it in a ramp from the point before: for a sweep in 4/4,
  `"0:300 32~900"` goes up from 300 to 900 over eight bars. Beats must be under
  `bars` times the beats of a bar. `mute` and `solo` are 1 (on) or 0. Do not
  automate pattern params: change the pattern instead.

A good structure to start with: an intro with only drums and bass (mute the rest
with `mute` in the automation), a part A, a part B with the A2 patterns, back to
A, and an ending with `fade`.

## Common mistakes

- A number out of range (a `Q` of 40, or a `decay` of 0).
- A `steps` or rhythm text with 15 or 17 words.
- A chance or a roll (`x?50`, `x3`) in the `rhythm` of the Arp: only the Drums
  play them.
- A Seq note out of C4–B6 (`A2` instead of `A4` with `"octave": -2`).
- An oscillator in `mode` `free` taking the `pitch` of a sequencer: it plays out
  of tune. It must be `keyboard`.
- A VCA with a `gain` other than 0: the note never stops.
- A cable between ports of different types (a `gate` into `detune`).
- A song row with an `id` that does not exist, or of a node without patterns:
  it is dropped without a warning.
- Flats (`Bb4`): they do not exist; write `A#4`.

## Module reference

The modules, with their inputs and outputs and their params. "Modulatable" means
the param is also a control input. Left out: the Sampler (it needs an audio
sample inside the file), the Audio Input (the microphone), the Custom Filter and
subpatches, which a song does not need.

### Sound sources

#### `oscillator` — Oscillator

A tone with a classic waveform.

- Inputs: `frequency` (control), `detune` (control)
- Outputs: `audio` (audio)

| Param | Values | Default | Modulatable |
| --- | --- | --- | --- |
| `waveform` | `sine`, `square`, `sawtooth`, `triangle`, `drawn`, `harmonics` | `sine` | no |
| `mode` | `free`, `keyboard` | `free` | no |
| `frequency` | 20 to 20000 Hz | `440` | yes |
| `detune` | -1200 to 1200 ct | `0` | yes |
| `shape` | curve of 64 values; leave it out | (curve) | no |
| `harmonics` | curve of 16 values; leave it out | (curve) | no |

#### `vco` — VCO

An analog oscillator: pulse width, detuned voices, hard sync and drift.
`voices` and `spread` make a supersaw; a sound into `sync` starts its cycle
over.

- Inputs: `sync` (audio), `frequency` (control), `detune` (control), `width`
  (control)
- Outputs: `audio` (audio)

| Param | Values | Default | Modulatable |
| --- | --- | --- | --- |
| `waveform` | `sawtooth`, `square`, `triangle`, `sine` | `sawtooth` | no |
| `mode` | `free`, `keyboard` | `free` | no |
| `frequency` | 20 to 20000 Hz | `440` | yes |
| `detune` | -1200 to 1200 ct | `0` | yes |
| `width` | 0.05 to 0.95 | `0.5` | yes |
| `voices` | 1 to 7 | `1` | no |
| `spread` | 0 to 100 ct | `20` | no |
| `drift` | 0 to 1 | `0` | no |

#### `harmonics` — Harmonics

A tone built from sixteen harmonics you draw.

- Inputs: `frequency` (control), `detune` (control), `brightness` (control),
  `even` (control)
- Outputs: `audio` (audio)

| Param | Values | Default | Modulatable |
| --- | --- | --- | --- |
| `mode` | `free`, `keyboard` | `free` | no |
| `frequency` | 20 to 1000 Hz | `110` | yes |
| `detune` | -1200 to 1200 ct | `0` | yes |
| `brightness` | 0 to 1 | `1` | yes |
| `even` | 0 to 1 | `1` | yes |
| `harmonics` | curve of 16 values; leave it out | (curve) | no |

#### `physicalModel` — Physical Model

A plucked string, played by a gate.

- Inputs: `gate` (trigger), `frequency` (control), `detune` (control),
  `brightness` (control)
- Outputs: `audio` (audio)

| Param | Values | Default | Modulatable |
| --- | --- | --- | --- |
| `mode` | `free`, `keyboard` | `free` | no |
| `frequency` | 20 to 4000 Hz | `220` | yes |
| `detune` | -1200 to 1200 ct | `0` | yes |
| `decay` | 0.05 to 10 s | `1.5` | no |
| `damp` | 0.005 to 2 s | `0.08` | no |
| `brightness` | 0 to 1 | `0.5` | yes |

#### `piano` — Piano

A grand piano played by notes, chords and velocity included. `pedal` from 0.5
up holds the notes let go, like a sustain pedal.

- Inputs: `notes` (notes), `brightness` (control), `pedal` (control)
- Outputs: `audio` (audio)

| Param | Values | Default | Modulatable |
| --- | --- | --- | --- |
| `brightness` | 0 to 1 | `0.5` | yes |
| `decay` | 0.25 to 2 | `1` | no |
| `unison` | 0 to 4 | `1` | no |
| `hammer` | 0 to 1 | `0.3` | no |
| `pedal` | 0 to 1 | `0` | yes |
| `body` | 0 to 1 | `0.6` | no |

#### `wind` — Wind

A wind instrument played by notes, one at a time: a note played while another
is held slurs to it, and velocity and `breath` blow it harder. `exciter` and
`bore` choose the instrument; `body` raises or lowers 32 bands from 100 Hz to
8 kHz, in dB.

- Inputs: `notes` (notes), `breath` (control), `detune` (control),
  `brightness` (control)
- Outputs: `audio` (audio)

| Param | Values | Default | Modulatable |
| --- | --- | --- | --- |
| `exciter` | `reed`, `double reed`, `lips`, `air`, `duct` | `reed` | no |
| `bore` | `cylinder`, `cone` | `cylinder` | no |
| `breath` | 0 to 1 | `0.7` | yes |
| `detune` | -1200 to 1200 ct | `0` | yes |
| `noise` | 0 to 1 | `0.2` | no |
| `brightness` | 0 to 1 | `0.5` | yes |
| `vibrato` | 0 to 1 | `0` | no |
| `bell` | 300 to 12000 Hz | `2000` | no |
| `flare` | 0 to 1 | `0` | no |
| `attack` | 0 to 1 | `0.5` | no |
| `body` | curve of 32 values, -12 to 24; leave it out | (curve) | no |

No param picks an instrument: the presets of the app (Flute, Oboe, Clarinet…)
are only these params with set values. To play one, write its values in
`params`. These are those of the presets; they also draw a `body`, except the
Flute, the Clarinet, the Alto recorder and the Pan flute, which keep it flat:

| Preset | `exciter` | `bore` | `brightness` | `bell` | `flare` | `attack` | `noise` | `vibrato` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Flute | `air` | `cylinder` | 0.5 | 12000 | 0 | 0.5 | 0.3 | 0.4 |
| Oboe | `double reed` | `cone` | 0.82 | 4500 | 0.29 | 0.38 | 0.08 | 0.38 |
| Clarinet | `reed` | `cylinder` | 0.5 | 2000 | 0 | 0.5 | 0.2 | 0 |
| Horn | `lips` | `cone` | 0.69 | 600 | 1 | 0.21 | 0.1 | 0 |
| Bassoon | `double reed` | `cone` | 0.67 | 2500 | 0 | 0.43 | 0.2 | 0.24 |
| Alto sax | `reed` | `cone` | 0.7 | 650 | 1 | 0.5 | 0.25 | 0.3 |
| Alto recorder | `duct` | `cone` | 0.4 | 12000 | 0 | 0.7 | 0.15 | 0 |
| Pan flute | `duct` | `cone` | 0.3 | 8000 | 0 | 0.2 | 0.6 | 0.25 |
| Flabiol | `duct` | `cone` | 0.7 | 12000 | 0 | 0.8 | 0.25 | 0.15 |
| Tible | `double reed` | `cone` | 1 | 6000 | 0.3 | 0.6 | 0.08 | 0.1 |
| Tenora | `double reed` | `cone` | 0.9 | 500 | 1 | 0.5 | 0.1 | 0.3 |
| Fiscorn | `lips` | `cone` | 0.7 | 800 | 0.8 | 0.3 | 0.1 | 0 |
| Trumpet | `lips` | `cylinder` | 0.9 | 500 | 1 | 0.5 | 0.08 | 0 |
| Trombone | `lips` | `cylinder` | 0.8 | 500 | 1 | 0.4 | 0.08 | 0 |

#### `strings` — Strings

A violin, a viola, a cello or a double bass played by notes, one at a time: a
string drawn by a bow, or plucked. A note played while another is held moves the
finger without lifting the bow, and velocity and `bow` draw it louder.
`pressure` is how hard the bow presses, `position` how near the bridge it draws:
nearer is brighter. Plucked, every note rings until it is let go. `body` is as
on the Wind.

- Inputs: `notes` (notes), `bow` (control), `pressure` (control), `position`
  (control), `detune` (control), `brightness` (control)
- Outputs: `audio` (audio)

| Param | Values | Default | Modulatable |
| --- | --- | --- | --- |
| `play` | `bowed`, `plucked` | `bowed` | no |
| `bow` | 0 to 1 | `0.7` | yes |
| `pressure` | 0 to 1 | `0.5` | yes |
| `position` | 0.06 to 0.25 | `0.12` | yes |
| `detune` | -1200 to 1200 ct | `0` | yes |
| `brightness` | 0 to 1 | `0.5` | yes |
| `noise` | 0 to 1 | `0.15` | no |
| `vibrato` | 0 to 1 | `0` | no |
| `attack` | 0 to 1 | `0.4` | no |
| `body` | curve of 32 values, -12 to 24; leave it out | (curve) | no |

As with the Wind, the presets (Violin, Viola, Cello, Double bass) are values of
these params, and all four draw a `body`. Any of them can be `bowed` or
`plucked`:

| Preset | `pressure` | `position` | `brightness` | `noise` | `vibrato` | `attack` |
| --- | --- | --- | --- | --- | --- | --- |
| Violin | 0.5 | 0.12 | 0.6 | 0.15 | 0.4 | 0.4 |
| Viola | 0.55 | 0.13 | 0.5 | 0.15 | 0.35 | 0.45 |
| Cello | 0.6 | 0.13 | 0.45 | 0.12 | 0.4 | 0.4 |
| Double bass | 0.3 | 0.12 | 0.35 | 0.1 | 0.25 | 0.6 |

#### `modal` — Modal

A struck bell, bar or gong, played by a gate, ringing with the partials of its
`model`. `stretch` draws its partials together or pushes them apart.

- Inputs: `gate` (trigger), `frequency` (control), `detune` (control),
  `brightness` (control)
- Outputs: `audio` (audio)

| Param | Values | Default | Modulatable |
| --- | --- | --- | --- |
| `model` | `tubular`, `bell`, `marimba`, `vibraphone`, `glass`, `gong` | `tubular` | no |
| `mode` | `free`, `keyboard` | `free` | no |
| `frequency` | 20 to 8000 Hz | `440` | yes |
| `detune` | -1200 to 1200 ct | `0` | yes |
| `decay` | 0.1 to 10 s | `3` | no |
| `brightness` | 0 to 1 | `0.6` | yes |
| `hit` | 0 to 1 | `0.7` | no |
| `stretch` | -1 to 1 | `0` | no |

#### `noise` — Noise

White noise.

- Inputs: none
- Outputs: `audio` (audio)

### Processing

#### `filter` — Filter

Cuts or boosts a band of frequencies.

- Inputs: `audio` (audio), `frequency` (control), `Q` (control)
- Outputs: `audio` (audio)

| Param | Values | Default | Modulatable |
| --- | --- | --- | --- |
| `type` | `lowpass`, `highpass`, `bandpass`, `notch` | `lowpass` | no |
| `frequency` | 20 to 20000 Hz | `1200` | yes |
| `Q` | 0.1 to 30 | `1` | yes |

#### `ladder` — Ladder

The 24 dB low-pass of a Moog: it saturates, and sings at full resonance.
`resonance` near 1 makes it sing on its own at `frequency`; `drive` pushes the
sound into saturation.

- Inputs: `audio` (audio), `frequency` (control), `resonance` (control)
- Outputs: `audio` (audio)

| Param | Values | Default | Modulatable |
| --- | --- | --- | --- |
| `frequency` | 20 to 20000 Hz | `800` | yes |
| `resonance` | 0 to 1 | `0.3` | yes |
| `drive` | 0 to 1 | `0.2` | no |

#### `pitchShifter` — Pitch Shifter

Moves the pitch of a sound, keeping its length.

- Inputs: `audio` (audio), `shift` (control)
- Outputs: `audio` (audio)

| Param | Values | Default | Modulatable |
| --- | --- | --- | --- |
| `shift` | -24 to 24 st | `7` | yes |
| `window` | 20 to 200 ms | `60` | no |
| `mix` | 0 to 1 | `0.5` | no |

#### `spectralFreeze` — Spectral Freeze

Holds the sound of an instant while its gate is open.

- Inputs: `audio` (audio), `gate` (trigger)
- Outputs: `audio` (audio)

| Param | Values | Default | Modulatable |
| --- | --- | --- | --- |
| `mix` | 0 to 1 | `0.5` | no |
| `release` | 0.01 to 10 s | `1` | no |

#### `granulator` — Granulator

Breaks the sound it gets into a cloud of grains.

- Inputs: `audio` (audio), `position` (control), `pitch` (control), `spread`
  (control)
- Outputs: `audio` (audio)

| Param | Values | Default | Modulatable |
| --- | --- | --- | --- |
| `position` | 0 to 4 s | `0.3` | yes |
| `size` | 10 to 500 ms | `80` | no |
| `density` | 1 to 100 /s | `20` | no |
| `pitch` | -24 to 24 st | `0` | yes |
| `spread` | 0 to 1 | `0.2` | yes |
| `mix` | 0 to 1 | `0.7` | no |
| `freeze` | `off`, `on` | `off` | no |

#### `gain` — Gain

Volume; with an ADSR, a VCA.

- Inputs: `audio` (audio), `gain` (control)
- Outputs: `audio` (audio)

| Param | Values | Default | Modulatable |
| --- | --- | --- | --- |
| `gain` | 0 to 1 | `0.5` | yes |

#### `delay` — Delay

Echo with feedback.

- Inputs: `audio` (audio)
- Outputs: `audio` (audio)

| Param | Values | Default | Modulatable |
| --- | --- | --- | --- |
| `sync` | `free`, `1/16`, `1/8`, `3/16`, `1/4`, `3/8`, `1/2` | `free` | no |
| `time` | 0.01 to 2 s | `0.3` | no |
| `feedback` | 0 to 0.95 | `0.4` | no |
| `mix` | 0 to 1 | `0.5` | no |

#### `distortion` — Distortion

Saturates, clips or folds the sound, or bends it through a curve you draw.

- Inputs: `audio` (audio), `drive` (control), `tone` (control)
- Outputs: `audio` (audio)

| Param | Values | Default | Modulatable |
| --- | --- | --- | --- |
| `mode` | `soft`, `hard`, `fold`, `drawn` | `soft` | no |
| `drive` | 1 to 40 | `4` | yes |
| `shape` | curve of 64 values; leave it out | (curve) | no |
| `tone` | 500 to 20000 Hz | `12000` | yes |
| `mix` | 0 to 1 | `1` | no |

#### `reverb` — Reverb

The sound of a room, from a small one to a hall.

- Inputs: `audio` (audio), `tone` (control)
- Outputs: `audio` (audio)

| Param | Values | Default | Modulatable |
| --- | --- | --- | --- |
| `decay` | 0.1 to 10 s | `2` | no |
| `predelay` | 0 to 0.25 s | `0.02` | no |
| `tone` | 500 to 20000 Hz | `6000` | yes |
| `mix` | 0 to 1 | `0.3` | no |

#### `compressor` — Compressor

Brings the loud parts of a sound down, for drums and the whole mix.

- Inputs: `audio` (audio)
- Outputs: `audio` (audio)

| Param | Values | Default | Modulatable |
| --- | --- | --- | --- |
| `threshold` | -60 to 0 dB | `-24` | no |
| `ratio` | 1 to 20 | `4` | no |
| `knee` | 0 to 40 dB | `6` | no |
| `attack` | 0.001 to 1 s | `0.003` | no |
| `release` | 0.01 to 1 s | `0.25` | no |
| `makeup` | 0 to 24 dB | `0` | no |

#### `chorus` — Chorus

Copies of a sound a little late, swept by an LFO: wider and thicker.

- Inputs: `audio` (audio)
- Outputs: `audio` (audio)

| Param | Values | Default | Modulatable |
| --- | --- | --- | --- |
| `rate` | 0.05 to 10 Hz | `0.8` | no |
| `depth` | 0 to 1 | `0.5` | no |
| `delay` | 5 to 40 ms | `18` | no |
| `voices` | 1 to 4 | `2` | no |
| `mix` | 0 to 1 | `0.5` | no |

#### `flanger` — Flanger

A very short swept delay fed back into itself: the sound of a jet.

- Inputs: `audio` (audio)
- Outputs: `audio` (audio)

| Param | Values | Default | Modulatable |
| --- | --- | --- | --- |
| `rate` | 0.05 to 10 Hz | `0.3` | no |
| `depth` | 0 to 1 | `0.7` | no |
| `delay` | 0.5 to 10 ms | `2` | no |
| `feedback` | -0.95 to 0.95 | `0.5` | no |
| `mix` | 0 to 1 | `0.5` | no |

#### `phaser` — Phaser

Notches swept up and down the sound by an LFO.

- Inputs: `audio` (audio)
- Outputs: `audio` (audio)

| Param | Values | Default | Modulatable |
| --- | --- | --- | --- |
| `rate` | 0.05 to 10 Hz | `0.5` | no |
| `depth` | 0 to 1 | `0.7` | no |
| `frequency` | 100 to 4000 Hz | `700` | no |
| `stages` | 2 to 12 | `4` | no |
| `feedback` | -0.95 to 0.95 | `0.3` | no |
| `mix` | 0 to 1 | `0.5` | no |

#### `mixer` — Mixer

Mixes sounds, a channel per cable.

- Inputs: `audio` (audio), `level` (control)
- Outputs: `audio` (audio)

| Param | Values | Default | Modulatable |
| --- | --- | --- | --- |
| `level` | 0 to 1 | `1` | yes |

#### `pan` — Pan

Places a sound between left and right.

- Inputs: `audio` (audio), `pan` (control)
- Outputs: `audio` (audio)

| Param | Values | Default | Modulatable |
| --- | --- | --- | --- |
| `pan` | -1 to 1 | `0` | yes |

### Modulation

#### `lfo` — LFO

A slow wave to move a param. With `sync` in bars, a bar is that of the meter.

- Inputs: none
- Outputs: `out` (control)

| Param | Values | Default | Modulatable |
| --- | --- | --- | --- |
| `waveform` | `sine`, `square`, `sawtooth`, `triangle` | `sine` | no |
| `sync` | `free`, `4 bars`, `2 bars`, `1 bar`, `1/2`, `1/4`, `1/8`, `1/16` | `free` | no |
| `rate` | 0.05 to 40 Hz | `2` | no |

#### `envelope` — ADSR

A shape started by a gate. With `curve` `clap`, it hits three times in a row,
each hit about `spread` seconds long, before its attack: a hand clap.

- Inputs: `gate` (trigger)
- Outputs: `out` (control)

| Param | Values | Default | Modulatable |
| --- | --- | --- | --- |
| `attack` | 0.001 to 5 s | `0.01` | no |
| `decay` | 0.001 to 5 s | `0.3` | no |
| `sustain` | 0 to 1 | `0.6` | no |
| `release` | 0.001 to 10 s | `0.5` | no |
| `curve` | `linear`, `exp`, `clap` | `linear` | no |
| `spread` | 0.001 to 0.05 s | `0.01` | no |

#### `sampleHold` — Sample & Hold

Holds the value of a signal, or a random one, on each step or gate.

- Inputs: `in` (control), `gate` (trigger)
- Outputs: `out` (control)

| Param | Values | Default | Modulatable |
| --- | --- | --- | --- |
| `clock` | `gate`, `1/4`, `1/8`, `1/16`, `1/32` | `1/8` | no |

#### `quantizer` — Quantizer

Rounds a pitch to the nearest note of a scale.

- Inputs: `in` (control)
- Outputs: `out` (control)

| Param | Values | Default | Modulatable |
| --- | --- | --- | --- |
| `root` | `C`, `C#`, `D`, `D#`, `E`, `F`, `F#`, `G`, `G#`, `A`, `A#`, `B` | `C` | no |
| `scale` | `chromatic`, `major`, `minor`, `pentatonic major`, `pentatonic minor`, `blues` | `major` | no |

#### `math` — Math

Adds, subtracts or multiplies two control signals, or takes the lowest or the
highest.

- Inputs: `a` (control), `b` (control)
- Outputs: `out` (control)

| Param | Values | Default | Modulatable |
| --- | --- | --- | --- |
| `operation` | `add`, `subtract`, `multiply`, `min`, `max` | `add` | no |
| `b` | -1 to 1 | `0` | yes |

#### `slew` — Slew

Smooths the jumps of a control signal: a portamento for any pitch.

- Inputs: `in` (control)
- Outputs: `out` (control)

| Param | Values | Default | Modulatable |
| --- | --- | --- | --- |
| `rise` | 0.001 to 10 s | `0.1` | no |
| `fall` | 0.001 to 10 s | `0.1` | no |

#### `envelopeFollower` — Envelope Follower

The level of a sound as a control signal: the base of a sidechain.

- Inputs: `audio` (audio)
- Outputs: `out` (control)

| Param | Values | Default | Modulatable |
| --- | --- | --- | --- |
| `attack` | 0.001 to 1 s | `0.01` | no |
| `release` | 0.001 to 5 s | `0.2` | no |
| `gain` | 0 to 4 | `1` | no |

#### `clock` — Clock

A gate on each division of the grid, or on one of every few gates it gets.

- Inputs: `gate` (trigger)
- Outputs: `bar` (trigger), `half` (trigger), `quarter` (trigger), `eighth`
  (trigger), `sixteenth` (trigger), `thirtysecond` (trigger)

| Param | Values | Default | Modulatable |
| --- | --- | --- | --- |
| `gate` | 0.05 to 0.95 | `0.5` | no |

### Notes (sequencers)

#### `keyboard` — Keyboard

Play notes with the computer keys.

- Inputs: none
- Outputs: `pitch` (control), `gate` (trigger), `notes` (notes), `velocity`
  (control)

| Param | Values | Default | Modulatable |
| --- | --- | --- | --- |
| `transpose` | 0 to 11 (0 = C, 1 = C#, … 11 = B) | `0` | no |

#### `midiInput` — MIDI In

Play notes with a MIDI keyboard or controller. It hears every MIDI device
plugged in, and the computer keys do not play it.

- Inputs: none
- Outputs: `pitch` (control, bent by the pitch wheel), `gate` (trigger), `notes`
  (notes), `velocity` (control), `mod` (control, the mod wheel, 0 to 1), `pedal`
  (control, the sustain pedal, 0 to 1)

| Param | Values | Default | Modulatable |
| --- | --- | --- | --- |
| `channel` | `all`, `1` to `16` | `all` | no |
| `transpose` | −24 to 24 semitones | `0` | no |
| `bend` | 0 to 12 semitones (how far the pitch wheel bends each way) | `2` | no |

#### `arpeggiator` — Arp

Plays the held keys in turn.

- Inputs: `clock` (trigger)
- Outputs: `pitch` (control), `gate` (trigger)
- Pattern params: `pattern`, `chord`, `length`, `rhythm`, `notes`

| Param | Values | Default | Modulatable |
| --- | --- | --- | --- |
| `source` | `keys`, `notes` | `keys` | no |
| `division` | `1/4`, `1/8`, `1/16`, `1/32`, `gate` | `1/16` | no |
| `start` | `grid`, `now` | `grid` | no |
| `pattern` | `up`, `down`, `up-down`, `random` | `up` | no |
| `chord` | `off`, `major`, `minor`, `7`, `maj7`, `m7`, `sus4` | `off` | no |
| `span` | 1 to 3 oct | `1` | no |
| `gate` | 0.05 to 1 | `0.5` | no |
| `length` | 1 to 16 | `8` | no |
| `transpose` | 0 to 11 (0 = C, 1 = C#, … 11 = B) | `0` | no |
| `rhythm` | text of 16 steps (see "Rhythms") | `x x x x x x x x x x x x x x x x` | no |
| `notes` | text of notes (see "Arp notes") | `C4 E4 G4` | no |
| `octave` | -3 to 3 | `0` | no |
| `keys` | `off`, `transpose` | `off` | no |
| `launch` | `bar`, `end`, `now` | `bar` | no |

#### `sequencer` — Seq

A loop of 16 steps.

- Inputs: `clock` (trigger)
- Outputs: `pitch` (control), `gate` (trigger), `accent` (control), `notes`
  (notes)
- Pattern params: `length`, `root`, `scale`, `chord`, `steps`

| Param | Values | Default | Modulatable |
| --- | --- | --- | --- |
| `division` | `1/4`, `1/8`, `1/16`, `1/32`, `gate` | `1/16` | no |
| `length` | 1 to 16 | `16` | no |
| `gate` | 0.05 to 1 | `0.5` | no |
| `glide` | 0 to 500 ms | `60` | no |
| `octave` | -3 to 3 | `0` | no |
| `root` | `C`, `C#`, `D`, `D#`, `E`, `F`, `F#`, `G`, `G#`, `A`, `A#`, `B` | `C` | no |
| `scale` | `chromatic`, `major`, `minor`, `pentatonic major`, `pentatonic minor`, `blues` | `pentatonic minor` | no |
| `chord` | `off`, `5th`, `triad`, `7th` | `off` | no |
| `keys` | `off`, `transpose` | `off` | no |
| `launch` | `bar`, `end`, `now` | `bar` | no |
| `steps` | text of 16 steps (see "Seq steps") | `C4 - D#4 - F4 - G4 - A#4 - G4 - F4 - D#4 -` | no |

#### `clip` — Clip

A phrase of notes of any length, on a piano roll.

- Inputs: none
- Outputs: `pitch` (control), `gate` (trigger), `notes` (notes), `velocity`
  (control)
- Pattern params: `bars`, `notes`

| Param | Values | Default | Modulatable |
| --- | --- | --- | --- |
| `bars` | 1 to 16 | `2` | no |
| `octave` | -3 to 3 | `0` | no |
| `notes` | text of notes (see "Clip notes") | `C4@0+1 D#4@1+0.5 G4@1.5+1.5 A#4@3+1 G4@4+2 F4@6+1 D#4@7+1` | no |
| `launch` | `bar`, `end`, `now` | `bar` | no |

#### `drums` — Drums

A row of steps for each drum, each with a gate.

- Inputs: `clock` (trigger)
- Outputs: `kick` (trigger), `snare` (trigger), `clap` (trigger), `rim`
  (trigger), `lowtom` (trigger), `hightom` (trigger), `hat` (trigger), `open`
  (trigger), `accent` (control)
- Pattern params: `length`, `kick`, `snare`, `clap`, `rim`, `lowtom`,
  `hightom`, `hat`, `open`, `accent`

| Param | Values | Default | Modulatable |
| --- | --- | --- | --- |
| `division` | `1/4`, `1/8`, `1/16`, `1/32`, `gate` | `1/16` | no |
| `length` | 1 to 16 | `16` | no |
| `gate` | 0.05 to 1 | `0.5` | no |
| `launch` | `bar`, `end`, `now` | `bar` | no |
| `kick` | text of 16 steps (see "Rhythms") | `x - - - x - - - x - - - x - - -` | no |
| `snare` | text of 16 steps (see "Rhythms") | `- - - - x - - - - - - - x - - -` | no |
| `clap` | text of 16 steps (see "Rhythms") | `- - - - - - - - - - - - - - - -` | no |
| `rim` | text of 16 steps (see "Rhythms") | `- - - - - - - - - - - - - - - -` | no |
| `lowtom` | text of 16 steps (see "Rhythms") | `- - - - - - - - - - - - - - - -` | no |
| `hightom` | text of 16 steps (see "Rhythms") | `- - - - - - - - - - - - - - - -` | no |
| `hat` | text of 16 steps (see "Rhythms") | `- - x - - - x - - - x - - - x -` | no |
| `open` | text of 16 steps (see "Rhythms") | `- - - - - - - - - - - - - - - -` | no |
| `accent` | text of 16 steps (see "Rhythms") | `- - - - - - - - - - - - - - - -` | no |

### Output

#### `output` — Output

To the speakers, with a level meter. The limiter keeps the sound under 0 dBFS,
and mutes it if it runs away.

- Inputs: `audio` (audio)
- Outputs: none

| Param | Values | Default | Modulatable |
| --- | --- | --- | --- |
| `volume` | 0 to 1 | `1` | no |
| `limiter` | `on`, `off` | `on` | no |

#### `scope` — Scope

Draws the signals it gets.

- Inputs: `audio` (audio), `control` (control)
- Outputs: none

| Param | Values | Default | Modulatable |
| --- | --- | --- | --- |
| `time` | 0.005 to 5 s | `0.02` | no |
| `range` | 0.01 to 10 | `1` | no |
| `trigger` | id of a cable into it; leave it out | (first cable) | no |

## Full example

A 16-bar song at 124 BPM in A minor: Drums (kick, snare and hi-hat), a Seq bass
with a filter that opens slowly in the second half, an Arp with its own notes and
an echo, all into a Mixer. The Arp is silent for the first four bars (`mute` in
the automation), the A2 patterns come in every four bars, and the last two bars
fade out. Save it as a `.json` file and open it with **Load**.

```json
{
  "version": 1,
  "tempo": 124,
  "nodes": [
    {
      "id": "drums-1",
      "type": "drums",
      "name": "Beat",
      "position": {
        "x": 0,
        "y": 0
      },
      "params": {
        "division": "1/16",
        "length": 16,
        "gate": 0.5,
        "launch": "bar",
        "kick": "x - - - x - - - x - - - x - - -",
        "snare": "- - - - x - - - - - - - x - - -",
        "hat": "- - x - - - x - - - x - - - x -",
        "open": "- - - - - - - - - - - - - - - -",
        "accent": "- - - - - - - - - - - - - - - -"
      },
      "patterns": {
        "A2": {
          "hat": "x x x x x x x x x x x x x x x x",
          "snare": "- - - - x - - x - - - - x - x -"
        }
      }
    },
    {
      "id": "oscillator-2",
      "type": "oscillator",
      "name": "Kick",
      "position": {
        "x": 400,
        "y": 0
      },
      "params": {
        "waveform": "sine",
        "mode": "free",
        "frequency": 55,
        "detune": 0
      }
    },
    {
      "id": "envelope-3",
      "type": "envelope",
      "position": {
        "x": 400,
        "y": 250
      },
      "params": {
        "attack": 0.001,
        "decay": 0.25,
        "sustain": 0,
        "release": 0.05,
        "curve": "exp"
      }
    },
    {
      "id": "gain-4",
      "type": "gain",
      "name": "Kick VCA",
      "position": {
        "x": 750,
        "y": 0
      },
      "params": {
        "gain": 0
      }
    },
    {
      "id": "noise-5",
      "type": "noise",
      "position": {
        "x": 400,
        "y": 500
      },
      "params": {}
    },
    {
      "id": "filter-6",
      "type": "filter",
      "position": {
        "x": 750,
        "y": 500
      },
      "params": {
        "type": "highpass",
        "frequency": 7000,
        "Q": 1
      }
    },
    {
      "id": "envelope-7",
      "type": "envelope",
      "position": {
        "x": 400,
        "y": 700
      },
      "params": {
        "attack": 0.001,
        "decay": 0.05,
        "sustain": 0,
        "release": 0.03,
        "curve": "exp"
      }
    },
    {
      "id": "gain-8",
      "type": "gain",
      "name": "Hat VCA",
      "position": {
        "x": 1100,
        "y": 500
      },
      "params": {
        "gain": 0
      }
    },
    {
      "id": "noise-9",
      "type": "noise",
      "position": {
        "x": 400,
        "y": 950
      },
      "params": {}
    },
    {
      "id": "filter-10",
      "type": "filter",
      "position": {
        "x": 750,
        "y": 950
      },
      "params": {
        "type": "bandpass",
        "frequency": 1800,
        "Q": 1
      }
    },
    {
      "id": "envelope-11",
      "type": "envelope",
      "position": {
        "x": 400,
        "y": 1150
      },
      "params": {
        "attack": 0.001,
        "decay": 0.12,
        "sustain": 0,
        "release": 0.08,
        "curve": "exp"
      }
    },
    {
      "id": "gain-12",
      "type": "gain",
      "name": "Snare VCA",
      "position": {
        "x": 1100,
        "y": 950
      },
      "params": {
        "gain": 0
      }
    },
    {
      "id": "sequencer-13",
      "type": "sequencer",
      "name": "Bass",
      "position": {
        "x": 0,
        "y": 1400
      },
      "params": {
        "division": "1/16",
        "length": 16,
        "gate": 0.5,
        "glide": 40,
        "octave": -2,
        "root": "A",
        "scale": "pentatonic minor",
        "chord": "off",
        "keys": "off",
        "launch": "bar",
        "steps": "A4 - A4 - C5 - A4 - D5 - C5 - G4 - E4 -"
      },
      "patterns": {
        "A2": {
          "steps": "F4 - F4 - A4 - F4 - G4 - G4 - E4 - D4 -"
        }
      }
    },
    {
      "id": "oscillator-14",
      "type": "oscillator",
      "position": {
        "x": 400,
        "y": 1400
      },
      "params": {
        "waveform": "sawtooth",
        "mode": "keyboard",
        "frequency": 440,
        "detune": 0
      }
    },
    {
      "id": "filter-15",
      "type": "filter",
      "position": {
        "x": 750,
        "y": 1400
      },
      "params": {
        "type": "lowpass",
        "frequency": 500,
        "Q": 6
      }
    },
    {
      "id": "envelope-16",
      "type": "envelope",
      "position": {
        "x": 400,
        "y": 1650
      },
      "params": {
        "attack": 0.005,
        "decay": 0.2,
        "sustain": 0.3,
        "release": 0.1,
        "curve": "linear"
      }
    },
    {
      "id": "gain-17",
      "type": "gain",
      "name": "Bass VCA",
      "position": {
        "x": 1100,
        "y": 1400
      },
      "params": {
        "gain": 0
      }
    },
    {
      "id": "arpeggiator-18",
      "type": "arpeggiator",
      "name": "Arp",
      "position": {
        "x": 0,
        "y": 1900
      },
      "params": {
        "source": "notes",
        "division": "1/16",
        "start": "grid",
        "pattern": "up-down",
        "chord": "off",
        "span": 2,
        "gate": 0.4,
        "length": 16,
        "transpose": 0,
        "rhythm": "x x - x x - x x x x - x x - x x",
        "notes": "C4 E4 A4",
        "octave": 0,
        "keys": "off",
        "launch": "bar"
      },
      "patterns": {
        "A2": {
          "notes": "D4 F4 A4"
        }
      }
    },
    {
      "id": "oscillator-19",
      "type": "oscillator",
      "position": {
        "x": 400,
        "y": 1900
      },
      "params": {
        "waveform": "square",
        "mode": "keyboard",
        "frequency": 440,
        "detune": 0
      }
    },
    {
      "id": "envelope-20",
      "type": "envelope",
      "position": {
        "x": 400,
        "y": 2150
      },
      "params": {
        "attack": 0.005,
        "decay": 0.15,
        "sustain": 0.2,
        "release": 0.2,
        "curve": "exp"
      }
    },
    {
      "id": "gain-21",
      "type": "gain",
      "name": "Arp VCA",
      "position": {
        "x": 750,
        "y": 1900
      },
      "params": {
        "gain": 0
      }
    },
    {
      "id": "delay-22",
      "type": "delay",
      "name": "Arp echo",
      "position": {
        "x": 1100,
        "y": 1900
      },
      "params": {
        "sync": "3/16",
        "time": 0.3,
        "feedback": 0.35,
        "mix": 0.3
      }
    },
    {
      "id": "mixer-23",
      "type": "mixer",
      "name": "Mix",
      "position": {
        "x": 1450,
        "y": 800
      },
      "params": {
        "level": 0.8
      }
    },
    {
      "id": "output-24",
      "type": "output",
      "position": {
        "x": 1800,
        "y": 800
      },
      "params": {
        "volume": 0.8
      }
    }
  ],
  "connections": [
    {
      "id": "drums-1:kick->envelope-3:gate",
      "source": {
        "nodeId": "drums-1",
        "port": "kick"
      },
      "target": {
        "nodeId": "envelope-3",
        "port": "gate"
      }
    },
    {
      "id": "envelope-3:out->gain-4:gain",
      "source": {
        "nodeId": "envelope-3",
        "port": "out"
      },
      "target": {
        "nodeId": "gain-4",
        "port": "gain"
      }
    },
    {
      "id": "envelope-3:out->oscillator-2:detune",
      "source": {
        "nodeId": "envelope-3",
        "port": "out"
      },
      "target": {
        "nodeId": "oscillator-2",
        "port": "detune"
      },
      "amount": 1
    },
    {
      "id": "oscillator-2:audio->gain-4:audio",
      "source": {
        "nodeId": "oscillator-2",
        "port": "audio"
      },
      "target": {
        "nodeId": "gain-4",
        "port": "audio"
      }
    },
    {
      "id": "drums-1:hat->envelope-7:gate",
      "source": {
        "nodeId": "drums-1",
        "port": "hat"
      },
      "target": {
        "nodeId": "envelope-7",
        "port": "gate"
      }
    },
    {
      "id": "noise-5:audio->filter-6:audio",
      "source": {
        "nodeId": "noise-5",
        "port": "audio"
      },
      "target": {
        "nodeId": "filter-6",
        "port": "audio"
      }
    },
    {
      "id": "filter-6:audio->gain-8:audio",
      "source": {
        "nodeId": "filter-6",
        "port": "audio"
      },
      "target": {
        "nodeId": "gain-8",
        "port": "audio"
      }
    },
    {
      "id": "envelope-7:out->gain-8:gain",
      "source": {
        "nodeId": "envelope-7",
        "port": "out"
      },
      "target": {
        "nodeId": "gain-8",
        "port": "gain"
      }
    },
    {
      "id": "drums-1:snare->envelope-11:gate",
      "source": {
        "nodeId": "drums-1",
        "port": "snare"
      },
      "target": {
        "nodeId": "envelope-11",
        "port": "gate"
      }
    },
    {
      "id": "noise-9:audio->filter-10:audio",
      "source": {
        "nodeId": "noise-9",
        "port": "audio"
      },
      "target": {
        "nodeId": "filter-10",
        "port": "audio"
      }
    },
    {
      "id": "filter-10:audio->gain-12:audio",
      "source": {
        "nodeId": "filter-10",
        "port": "audio"
      },
      "target": {
        "nodeId": "gain-12",
        "port": "audio"
      }
    },
    {
      "id": "envelope-11:out->gain-12:gain",
      "source": {
        "nodeId": "envelope-11",
        "port": "out"
      },
      "target": {
        "nodeId": "gain-12",
        "port": "gain"
      }
    },
    {
      "id": "sequencer-13:pitch->oscillator-14:detune",
      "source": {
        "nodeId": "sequencer-13",
        "port": "pitch"
      },
      "target": {
        "nodeId": "oscillator-14",
        "port": "detune"
      }
    },
    {
      "id": "sequencer-13:gate->envelope-16:gate",
      "source": {
        "nodeId": "sequencer-13",
        "port": "gate"
      },
      "target": {
        "nodeId": "envelope-16",
        "port": "gate"
      }
    },
    {
      "id": "oscillator-14:audio->filter-15:audio",
      "source": {
        "nodeId": "oscillator-14",
        "port": "audio"
      },
      "target": {
        "nodeId": "filter-15",
        "port": "audio"
      }
    },
    {
      "id": "filter-15:audio->gain-17:audio",
      "source": {
        "nodeId": "filter-15",
        "port": "audio"
      },
      "target": {
        "nodeId": "gain-17",
        "port": "audio"
      }
    },
    {
      "id": "envelope-16:out->gain-17:gain",
      "source": {
        "nodeId": "envelope-16",
        "port": "out"
      },
      "target": {
        "nodeId": "gain-17",
        "port": "gain"
      }
    },
    {
      "id": "envelope-16:out->filter-15:frequency",
      "source": {
        "nodeId": "envelope-16",
        "port": "out"
      },
      "target": {
        "nodeId": "filter-15",
        "port": "frequency"
      },
      "amount": 0.5
    },
    {
      "id": "arpeggiator-18:pitch->oscillator-19:detune",
      "source": {
        "nodeId": "arpeggiator-18",
        "port": "pitch"
      },
      "target": {
        "nodeId": "oscillator-19",
        "port": "detune"
      }
    },
    {
      "id": "arpeggiator-18:gate->envelope-20:gate",
      "source": {
        "nodeId": "arpeggiator-18",
        "port": "gate"
      },
      "target": {
        "nodeId": "envelope-20",
        "port": "gate"
      }
    },
    {
      "id": "oscillator-19:audio->gain-21:audio",
      "source": {
        "nodeId": "oscillator-19",
        "port": "audio"
      },
      "target": {
        "nodeId": "gain-21",
        "port": "audio"
      }
    },
    {
      "id": "envelope-20:out->gain-21:gain",
      "source": {
        "nodeId": "envelope-20",
        "port": "out"
      },
      "target": {
        "nodeId": "gain-21",
        "port": "gain"
      }
    },
    {
      "id": "gain-21:audio->delay-22:audio",
      "source": {
        "nodeId": "gain-21",
        "port": "audio"
      },
      "target": {
        "nodeId": "delay-22",
        "port": "audio"
      }
    },
    {
      "id": "gain-4:audio->mixer-23:audio",
      "source": {
        "nodeId": "gain-4",
        "port": "audio"
      },
      "target": {
        "nodeId": "mixer-23",
        "port": "audio"
      },
      "amount": 1
    },
    {
      "id": "gain-8:audio->mixer-23:audio",
      "source": {
        "nodeId": "gain-8",
        "port": "audio"
      },
      "target": {
        "nodeId": "mixer-23",
        "port": "audio"
      },
      "amount": 0.35,
      "pan": 0.2
    },
    {
      "id": "gain-12:audio->mixer-23:audio",
      "source": {
        "nodeId": "gain-12",
        "port": "audio"
      },
      "target": {
        "nodeId": "mixer-23",
        "port": "audio"
      },
      "amount": 0.6
    },
    {
      "id": "gain-17:audio->mixer-23:audio",
      "source": {
        "nodeId": "gain-17",
        "port": "audio"
      },
      "target": {
        "nodeId": "mixer-23",
        "port": "audio"
      },
      "amount": 0.8
    },
    {
      "id": "delay-22:audio->mixer-23:audio",
      "source": {
        "nodeId": "delay-22",
        "port": "audio"
      },
      "target": {
        "nodeId": "mixer-23",
        "port": "audio"
      },
      "amount": 0.45,
      "pan": -0.3
    },
    {
      "id": "mixer-23:audio->output-24:audio",
      "source": {
        "nodeId": "mixer-23",
        "port": "audio"
      },
      "target": {
        "nodeId": "output-24",
        "port": "audio"
      }
    }
  ],
  "song": {
    "bars": 16,
    "rows": {
      "drums-1": "A1 - - - - - - - A2 - - - - - - -",
      "sequencer-13": "A1 - - - A2 - - - A1 - - - A2 - - -",
      "arpeggiator-18": "A1 - - - A2 - - - A1 - - - A2 - - -"
    },
    "fade": 2,
    "automation": {
      "delay-22:audio->mixer-23:audio.mute": "0:1 16:0",
      "filter-15.frequency": "0:300 32:450 36:650 40:900 44:1200"
    }
  }
}
```
