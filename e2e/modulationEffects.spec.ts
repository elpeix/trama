import { expect, test } from "@playwright/test";
import { addModule, connect, example, loadPatchFile, node, openApp, setParam, signalLevel } from "./support";

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

for (const [title, type] of [
  ["Chorus", "chorus"],
  ["Flanger", "flanger"],
  ["Phaser", "phaser"],
] as const) {
  test(`lets a sound through the ${title}`, async ({ page }) => {
    await addModule(page, "Oscillator");
    await addModule(page, title);
    await addModule(page, "Output");
    await connect(page, ["oscillator-1", "audio"], [`${type}-2`, "audio"]);
    await connect(page, [`${type}-2`, "audio"], ["output-3", "audio"]);

    await page.getByRole("button", { name: "Start audio" }).click();

    await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.2);
  });
}

test("cancels the frequency where two stages of the Phaser turn the phase over", async ({ page }) => {
  await addModule(page, "Oscillator");
  await addModule(page, "Phaser");
  await addModule(page, "Output");
  await connect(page, ["oscillator-1", "audio"], ["phaser-2", "audio"]);
  await connect(page, ["phaser-2", "audio"], ["output-3", "audio"]);
  await setParam(page, "phaser-2", "Depth", 0);
  await setParam(page, "phaser-2", "Feedback", 0);
  await setParam(page, "phaser-2", "Stages", 2);
  await setParam(page, "phaser-2", "Freq", 440);

  await page.getByRole("button", { name: "Start audio" }).click();
  await expect.poll(() => page.evaluate(() => window.__audioContext?.state)).toBe("running");
  await page.waitForTimeout(300);

  await expect.poll(() => signalLevel(page)).toBeLessThan(0.05);

  await setParam(page, "phaser-2", "Freq", 3000);

  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.3);
});

for (const [name, output] of [
  ["40-chorus", "output-8"],
  ["41-flanger", "output-6"],
  ["42-phaser", "output-8"],
] as const) {
  test(`plays the example ${name} without the keyboard`, async ({ page }) => {
    await loadPatchFile(page, example(name));
    await expect(node(page, output)).toBeVisible();

    await page.getByRole("button", { name: "Start audio" }).click();

    await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.05);
  });
}
