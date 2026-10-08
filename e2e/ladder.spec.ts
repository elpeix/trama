import { expect, test } from "@playwright/test";
import { addModule, connect, example, loadPatchFile, node, openApp, setParam, signalLevel } from "./support";

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test("lets the sound through open, and cuts it down closed", async ({ page }) => {
  await addModule(page, "VCO");
  await addModule(page, "Ladder");
  await addModule(page, "Output");
  await connect(page, ["vco-1", "audio"], ["ladder-2", "audio"]);
  await connect(page, ["ladder-2", "audio"], ["output-3", "audio"]);
  await setParam(page, "ladder-2", "Res", 0);
  await setParam(page, "ladder-2", "Freq", 20000);
  await page.getByRole("button", { name: "Start audio" }).click();
  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.2);

  await setParam(page, "ladder-2", "Freq", 30);

  await expect.poll(() => signalLevel(page)).toBeLessThan(0.05);
});

test("plays the example of the Ladder without the keyboard", async ({ page }) => {
  await loadPatchFile(page, example("47-ladder"));
  await expect(node(page, "output-7")).toBeVisible();

  await page.getByRole("button", { name: "Start audio" }).click();

  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.05);
});
