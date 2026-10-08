import { expect, test, type Page } from "@playwright/test";
import { addModule, connect, node, openApp, setTempo } from "./support";

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

const meter = (page: Page) => page.getByRole("combobox", { name: "Meter" });

test("sets the meter from the bar, and keeps it with the patch", async ({ page }) => {
  await expect(meter(page)).toHaveValue("4/4");

  await meter(page).selectOption("3+2/4");
  await expect(meter(page)).toHaveValue("3+2/4");

  await page.waitForTimeout(700);
  await page.reload();
  await expect(meter(page)).toHaveValue("3+2/4");
});

test("marks the bars of the meter on the piano roll", async ({ page }) => {
  await meter(page).selectOption("3/4");
  await addModule(page, "Clip");
  await node(page, "clip-1").getByRole("button", { name: "Edit" }).click();

  const roll = page.getByRole("application", { name: "Piano roll" });
  const beatWidth = parseFloat(await roll.evaluate((element) => element.style.getPropertyValue("--beat")));
  const marks = page.getByLabel("Bars").locator(".clip-bar");
  await expect(marks).toHaveCount(2);
  const [first, second] = await Promise.all([marks.nth(0).boundingBox(), marks.nth(1).boundingBox()]);
  expect(second!.x - first!.x).toBeCloseTo(3 * beatWidth, 0);
});

test("marks the bars and dotted quarters of 6/8 on the piano roll, and keeps it with the patch", async ({ page }) => {
  await meter(page).selectOption("6/8");
  await addModule(page, "Clip");
  await node(page, "clip-1").getByRole("button", { name: "Edit" }).click();

  const roll = page.getByRole("application", { name: "Piano roll" });
  const width = (property: string) =>
    roll.evaluate((element, name) => parseFloat(element.style.getPropertyValue(name)), property);
  const beatWidth = await width("--beat");
  expect(await width("--pulse")).toBeCloseTo(1.5 * beatWidth, 3);
  const marks = page.getByLabel("Bars").locator(".clip-bar");
  const [first, second] = await Promise.all([marks.nth(0).boundingBox(), marks.nth(1).boundingBox()]);
  expect(second!.x - first!.x).toBeCloseTo(3 * beatWidth, 0);

  await page.waitForTimeout(700);
  await page.reload();
  await expect(meter(page)).toHaveValue("6/8");
});

test("plays a song of bars of the meter through to its end", async ({ page }) => {
  await setTempo(page, 60);
  await meter(page).selectOption("2/4");
  await addModule(page, "Oscillator");
  await addModule(page, "Output");
  await connect(page, ["oscillator-1", "audio"], ["output-2", "audio"]);
  await page.getByRole("button", { name: "Composer" }).click();
  const panel = page.getByRole("region", { name: "Song panel" });
  await panel.getByRole("spinbutton", { name: "Bars" }).dblclick();
  const bars = panel.getByRole("textbox", { name: "Bars" });
  await bars.fill("2");
  await bars.press("Enter");
  await page.getByRole("radio", { name: "Song" }).click();

  await page.getByRole("button", { name: "Start audio" }).click();
  await page.waitForTimeout(2500);
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start audio" })).toBeVisible({ timeout: 3000 });
});
