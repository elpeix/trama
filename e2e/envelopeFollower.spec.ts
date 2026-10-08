import { expect, test } from "@playwright/test";
import { addModule, connect, example, loadPatchFile, node, openApp, setParam, signalLevel } from "./support";

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test("opens a gain as loud as the sound it follows", async ({ page }) => {
  await addModule(page, "Oscillator");
  await addModule(page, "Envelope Follower");
  await addModule(page, "Oscillator");
  await addModule(page, "Gain");
  await addModule(page, "Output");
  await connect(page, ["oscillator-1", "audio"], ["envelopeFollower-2", "audio"]);
  await connect(page, ["oscillator-3", "audio"], ["gain-4", "audio"]);
  await connect(page, ["envelopeFollower-2", "out"], ["gain-4", "gain"]);
  await connect(page, ["gain-4", "audio"], ["output-5", "audio"]);
  await setParam(page, "gain-4", "Gain", 0);
  await page.getByRole("button", { name: "Start audio" }).click();

  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.5);

  await setParam(page, "envelopeFollower-2", "Gain", 0);

  await expect.poll(() => signalLevel(page)).toBeLessThan(0.01);
});

test("plays the example of the envelope follower without the keyboard", async ({ page }) => {
  await loadPatchFile(page, example("38-envelope-follower"));
  await expect(node(page, "output-9")).toBeVisible();

  await page.getByRole("button", { name: "Start audio" }).click();

  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.05);
});
