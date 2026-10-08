import { writeFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { example, loadPatchFile, node, openApp, setParam, signalLevel } from "./support";

/** How loud each frequency comes out, in dB, from the bin of the probe nearest to it. */
const levelsAt = (page: Page, frequencies: number[]) =>
  page.evaluate((wanted) => {
    const probe = window.__audioProbe!;
    const bins = new Float32Array(probe.frequencyBinCount);
    probe.getFloatFrequencyData(bins);
    return wanted.map((frequency) => bins[Math.round((frequency * probe.fftSize) / probe.context.sampleRate)]);
  }, frequencies);

test.beforeEach(async ({ page }) => {
  await openApp(page);
  await loadPatchFile(page, example("22-poly"));
});

test("plays a chord on the keys, a voice of the subpatch for each note", async ({ page }) => {
  // Sine waves through an open filter and no echo: each note is a single peak in the spectrum.
  await setParam(page, "delay-11", "Mix", 0);
  await node(page, "subpatch-2").getByRole("button", { name: "Open" }).click();
  await node(page, "oscillator-5").getByRole("combobox", { name: "Wave" }).selectOption("sine");
  await setParam(page, "filter-7", "Freq", 20000);
  await page.getByRole("button", { name: "Start audio" }).click();
  await page.locator(".react-flow__pane").click({ position: { x: 5, y: 5 } });

  // A and K: C4 and C5, an octave apart, with nothing in between.
  await page.keyboard.down("a");
  await page.keyboard.down("k");
  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.1);

  await expect
    .poll(async () => {
      const [low, middle, high] = await levelsAt(page, [261.6, 392, 523.3]);
      return Math.min(low, high) - middle;
    })
    .toBeGreaterThan(20);
});

test("plays the example of polyphony", async ({ page }) => {
  await expect(node(page, "subpatch-2").getByRole("slider", { name: "Voices" })).toHaveAttribute("aria-valuenow", "4");
  await page.getByRole("button", { name: "Start audio" }).click();
  await page.locator(".react-flow__pane").click({ position: { x: 5, y: 5 } });

  await page.keyboard.down("a");
  await page.keyboard.down("d");
  await page.keyboard.down("g");

  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.05);
});

test("plays the chords of a Clip, a voice for each note, without the keyboard", async ({ page }) => {
  await loadPatchFile(page, example("23-chords"));
  await page.getByRole("button", { name: "Start audio" }).click();

  // The first bar is A minor, A3 C4 E4: on a single voice only E4 would sound, and nothing at A3.
  await expect
    .poll(
      async () => {
        const [below, a3] = await levelsAt(page, [130, 220]);
        return a3 - below;
      },
      { timeout: 2000 },
    )
    .toBeGreaterThan(20);
});

test("plays the chord of the scale on each step of a Seq, a voice for each note", async ({ page }) => {
  await loadPatchFile(page, example("24-seq-chords"));
  await page.getByRole("button", { name: "Start audio" }).click();

  // The first step is A3 with a triad of A minor, A3 C4 E4: without the chord, nothing at E4.
  await expect
    .poll(
      async () => {
        const [below, e4] = await levelsAt(page, [130, 329.6]);
        return e4 - below;
      },
      { timeout: 2000 },
    )
    .toBeGreaterThan(20);
});

test("plays a whole loop of the chords of the Seq without asking for more voices, the same notes again on the voices of their tails", async ({ page }) => {
  await loadPatchFile(page, example("24-seq-chords"));
  await page.getByRole("button", { name: "Start audio" }).click();

  await page.waitForTimeout(6000);

  await expect(page.getByRole("status", { name: "Voices" })).toHaveCount(0);
});

test("plays the example of velocity, each voice as hard as its note is drawn", async ({ page }) => {
  await loadPatchFile(page, example("35-velocity"));
  await expect(page.locator(".react-flow__node")).toHaveCount(4);

  await page.getByRole("button", { name: "Start audio" }).click();

  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.05);
});

test("plays a chord on a Strings in a subpatch of voices, from the notes of its In", async ({ page }, testInfo) => {
  const file = testInfo.outputPath("strings-chord.json");
  const voice = {
    nodes: [
      { id: "inlet-1", type: "inlet", position: { x: 0, y: 0 }, params: { signal: "notes", value: 0 } },
      { id: "strings-2", type: "strings", position: { x: 300, y: 0 }, params: { play: "bowed" } },
      { id: "outlet-3", type: "outlet", position: { x: 600, y: 0 }, params: { signal: "audio" } },
    ],
    connections: [
      { id: "a", source: { nodeId: "inlet-1", port: "notes" }, target: { nodeId: "strings-2", port: "notes" } },
      { id: "b", source: { nodeId: "strings-2", port: "audio" }, target: { nodeId: "outlet-3", port: "in" } },
    ],
  };
  await writeFile(
    file,
    JSON.stringify({
      version: 1,
      tempo: 120,
      nodes: [
        { id: "clip-1", type: "clip", position: { x: 0, y: 0 }, params: { bars: 1, notes: "C4@0+4 G4@0+4" } },
        { id: "subpatch-2", type: "subpatch", position: { x: 300, y: 0 }, params: { voices: 2 }, patch: voice },
        { id: "output-3", type: "output", position: { x: 600, y: 0 }, params: {} },
      ],
      connections: [
        { id: "c", source: { nodeId: "clip-1", port: "notes" }, target: { nodeId: "subpatch-2", port: "inlet-1" } },
        { id: "d", source: { nodeId: "subpatch-2", port: "outlet-3" }, target: { nodeId: "output-3", port: "audio" } },
      ],
    }),
  );
  await loadPatchFile(page, file);
  await page.getByRole("button", { name: "Start audio" }).click();

  // C4 and G4 on a voice each: on a single Strings only G4 would sound, and nothing at C4.
  await expect
    .poll(
      async () => {
        const [below, c4, g4] = await levelsAt(page, [200, 261.6, 392]);
        return Math.min(c4, g4) - below;
      },
      { timeout: 3000 },
    )
    .toBeGreaterThan(20);
});
