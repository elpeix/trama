import { expect, test, type Page } from "@playwright/test";
import { addModule, connect, example, loadPatchFile, node, openApp, signalLevel } from "./support";

const SILENCE = 0.001;

/** A MIDI keyboard in place of the devices of the computer, played with `window.midi`. */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const input = Object.assign(new EventTarget(), { id: "virtual", name: "Virtual keys", type: "input", state: "connected" });
    const access = Object.assign(new EventTarget(), { inputs: new Map([[input.id, input]]) });
    Object.defineProperty(Navigator.prototype, "requestMIDIAccess", { value: () => Promise.resolve(access) });
    (window as { midi?: (...data: number[]) => void }).midi = (...data) =>
      input.dispatchEvent(Object.assign(new Event("midimessage"), { data: new Uint8Array(data) }));
    (window as { plugMidi?: (name: string) => void }).plugMidi = (name) => {
      const port = Object.assign(new EventTarget(), { id: name, name, type: "input", state: "connected" });
      access.inputs.set(port.id, port);
      access.dispatchEvent(Object.assign(new Event("statechange"), { port }));
    };
  });
  await openApp(page);
});

const midi = (page: Page, ...data: number[]) =>
  page.evaluate((bytes) => (window as { midi?: (...data: number[]) => void }).midi?.(...bytes), data);

test("plays the Piano from a MIDI keyboard, holding the notes while the pedal is down", async ({ page }) => {
  await addModule(page, "MIDI In");
  await addModule(page, "Piano");
  await addModule(page, "Output");
  await connect(page, ["midiInput-1", "notes"], ["piano-2", "notes"]);
  await connect(page, ["piano-2", "audio"], ["output-3", "audio"]);
  await expect(node(page, "midiInput-1").getByRole("status", { name: "MIDI" })).toHaveText("Virtual keys");
  await page.getByRole("button", { name: "Start audio" }).click();
  await expect.poll(() => signalLevel(page)).toBeLessThan(SILENCE);

  await midi(page, 0x90, 60, 110);
  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.02);
  await expect(node(page, "midiInput-1").getByLabel("Notes held")).toHaveText("C4");
  await midi(page, 0xb0, 64, 127);
  await midi(page, 0x80, 60, 0);
  await page.waitForTimeout(500);
  expect(await signalLevel(page)).toBeGreaterThan(SILENCE);

  await midi(page, 0xb0, 64, 0);

  await expect.poll(() => signalLevel(page)).toBeLessThan(SILENCE);
});

test("is not played by the computer keys", async ({ page }) => {
  await addModule(page, "MIDI In");
  await page.locator(".react-flow__pane").click({ position: { x: 5, y: 5 } });

  const status = node(page, "midiInput-1").getByRole("status", { name: "MIDI" });
  await expect(status).toHaveText("Virtual keys");

  await page.keyboard.down("a");
  await page.waitForTimeout(300);

  expect(await status.textContent()).toBe("Virtual keys");
  await page.keyboard.up("a");
});

test("loads the example of the MIDI piano, and plays it from MIDI", async ({ page }) => {
  await loadPatchFile(page, example("56-midi-piano"));
  await expect(node(page, "output-4")).toBeVisible();
  await page.getByRole("button", { name: "Start audio" }).click();

  await midi(page, 0x90, 64, 100);

  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.02);
});

test("shows every key held, without widening the node for them or for a long name of a device", async ({ page }) => {
  await addModule(page, "MIDI In");
  const midiIn = node(page, "midiInput-1");
  await expect(midiIn.getByRole("status", { name: "MIDI" })).toHaveText("Virtual keys");
  const width = (await midiIn.boundingBox())!.width;

  await page.evaluate(() => (window as { plugMidi?: (name: string) => void }).plugMidi?.("Controlador IAC Bus 1 de l'estudi MIDI"));
  await expect(midiIn.getByRole("status", { name: "MIDI" })).toHaveText("Virtual keys, Controlador IAC Bus 1 de l'estudi MIDI");

  await midi(page, 0x90, 60, 100);
  await midi(page, 0x90, 64, 100);
  await midi(page, 0x90, 67, 100);
  await midi(page, 0x90, 72, 100);

  await expect(midiIn.getByLabel("Notes held")).toHaveText("C4E4G4C5");
  expect((await midiIn.boundingBox())!.width).toBe(width);
});
