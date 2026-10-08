import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { addModule, example, loadPatchFile, node, openApp, signalLevel } from "./support";

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

/** A WAV file of a sine at 440 Hz, 16-bit mono. */
function toneFile(seconds: number, rate = 22050) {
  const length = Math.round(seconds * rate);
  const file = Buffer.alloc(44 + length * 2);
  file.write("RIFF", 0);
  file.writeUInt32LE(36 + length * 2, 4);
  file.write("WAVEfmt ", 8);
  file.writeUInt32LE(16, 16);
  file.writeUInt16LE(1, 20);
  file.writeUInt16LE(1, 22);
  file.writeUInt32LE(rate, 24);
  file.writeUInt32LE(rate * 2, 28);
  file.writeUInt16LE(2, 32);
  file.writeUInt16LE(16, 34);
  file.write("data", 36);
  file.writeUInt32LE(length * 2, 40);
  for (let index = 0; index < length; index++) {
    file.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * index) / rate) * 16000), 44 + index * 2);
  }
  return { name: "tone.wav", mimeType: "audio/wav", buffer: file };
}

const status = (page: import("@playwright/test").Page, id: string) =>
  node(page, id).getByRole("status", { name: "Sample file" });

test("plays the example of the sampler", async ({ page }) => {
  await loadPatchFile(page, example("32-sampler"));

  await expect(status(page, "sampler-2")).toHaveText("marimba-c4.wav · 0.70 s");
  await page.getByRole("button", { name: "Start audio" }).click();

  await expect.poll(() => signalLevel(page), { timeout: 10_000 }).toBeGreaterThan(0.05);
});

test("loads a file into the sampler, and keeps it after a reload", async ({ page }) => {
  await addModule(page, "Sampler");
  await expect(status(page, "sampler-1")).toHaveText(/No sample/);

  await node(page, "sampler-1").getByLabel("Load sample file").setInputFiles(toneFile(0.5));

  await expect(status(page, "sampler-1")).toHaveText("tone.wav · 0.50 s");
  await expect(node(page, "sampler-1").locator(".sample-peaks")).toBeAttached();

  await page.waitForTimeout(700);
  await page.reload();

  await expect(status(page, "sampler-1")).toHaveText("tone.wav · 0.50 s");
});

test("saves the example with its sample, as it was loaded", async ({ page }) => {
  await loadPatchFile(page, example("32-sampler"));
  await expect(status(page, "sampler-2")).toHaveText(/marimba/);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Save" }).click(),
  ]);

  const saved = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(saved).toEqual(JSON.parse(await readFile(example("32-sampler"), "utf8")));
});

test("adds files to the samples of a sampler, a slot for each, and takes one out", async ({ page }) => {
  await addModule(page, "Sampler");
  const sampler = node(page, "sampler-1");

  await sampler.getByLabel("Load sample file").setInputFiles(toneFile(0.5));
  await expect(status(page, "sampler-1")).toHaveText("tone.wav · 0.50 s");
  await sampler.getByLabel("Load sample file").setInputFiles([toneFile(0.25), toneFile(0.75)].map((file, index) => ({ ...file, name: `tone-${index + 2}.wav` })));

  const slots = sampler.getByRole("group", { name: "Samples" }).getByRole("button", { name: /^Sample \d$/ });
  await expect(slots).toHaveCount(3);
  await sampler.getByRole("button", { name: "Sample 3", exact: true }).click();
  await expect(status(page, "sampler-1")).toHaveText("tone-3.wav · 0.75 s");

  await sampler.getByRole("button", { name: "Remove sample 2" }).click();
  await expect(slots).toHaveCount(2);
});

test("plays the example of samplers with several samples, and saves it as it was loaded", async ({ page }) => {
  await loadPatchFile(page, example("49-samples"));
  await expect(node(page, "sampler-3").getByRole("group", { name: "Samples" }).getByRole("button", { name: /^Sample \d$/ })).toHaveCount(3);

  await page.getByRole("button", { name: "Start audio" }).click();
  await expect.poll(() => signalLevel(page), { timeout: 10_000 }).toBeGreaterThan(0.05);

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Save" }).click()]);
  const saved = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(saved).toEqual(JSON.parse(await readFile(example("49-samples"), "utf8")));
});
