import { expect, test, type Page } from "@playwright/test";
import { addModule, connect, node, openApp, setParam, setTempo } from "./support";

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

const performPanel = (page: Page) => page.getByRole("region", { name: "Perform panel" });

const pin = async (page: Page, nodeId: string, label: string) => {
  await node(page, nodeId).getByRole("slider", { name: label, exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Pin to Perform" }).click();
};

test("pins a knob of a node and turns it from the perform panel", async ({ page }) => {
  await addModule(page, "Filter");
  await pin(page, "filter-1", "Freq");
  await page.getByRole("button", { name: "Composer" }).click();
  await page.getByRole("tab", { name: "Perform" }).click();

  const knob = performPanel(page).getByRole("slider", { name: "Filter › Freq" });
  await knob.focus();
  await knob.press("Enter");
  const input = performPanel(page).getByRole("textbox", { name: "Filter › Freq" });
  await input.fill("300");
  await input.press("Enter");

  await expect(node(page, "filter-1").getByRole("slider", { name: "Freq" })).toHaveAttribute("aria-valuenow", "300");
});

test("keeps the knobs pinned, their names and their order across a reload", async ({ page }) => {
  await addModule(page, "Filter");
  await pin(page, "filter-1", "Freq");
  await pin(page, "filter-1", "Q");
  await page.getByRole("button", { name: "Composer" }).click();
  await page.getByRole("tab", { name: "Perform" }).click();
  const panel = performPanel(page);
  await panel.getByRole("button", { name: "Move Filter › Q" }).press("ArrowLeft");
  await panel.getByText("Q", { exact: true }).dblclick();
  await panel.getByRole("textbox", { name: "Name of Filter › Q" }).fill("Res");
  await panel.getByRole("textbox", { name: "Name of Filter › Q" }).press("Enter");

  await page.reload();
  await page.getByRole("button", { name: "Composer" }).click();
  await page.getByRole("tab", { name: "Perform" }).click();

  await expect(performPanel(page).getByRole("slider")).toHaveCount(2);
  const names = await performPanel(page).getByRole("slider").evaluateAll((knobs) => knobs.map((knob) => knob.getAttribute("aria-label")));
  expect(names).toEqual(["Res", "Filter › Freq"]);
});

test("launches a pattern of a node from the launcher while the sound runs", async ({ page }) => {
  await setTempo(page, 300);
  await addModule(page, "Seq");
  await page.getByRole("button", { name: "Composer" }).click();
  await page.getByRole("tab", { name: "Perform" }).click();
  const row = performPanel(page).getByRole("group", { name: "Patterns of Seq" });
  await page.getByRole("button", { name: "Start audio" }).click();

  await row.getByRole("button", { name: "Pattern A3" }).click();

  const slot = node(page, "sequencer-1").getByRole("group", { name: "Patterns" }).getByRole("button", { name: "Pattern A3" });
  await expect(slot).toHaveAttribute("data-playing", "true", { timeout: 3000 });
  await expect(row.getByRole("button", { name: "Pattern A3" })).toHaveAttribute("data-playing", "true");
  await page.getByRole("button", { name: "Stop" }).click();
});

test("keeps a node hidden from the launcher across a reload", async ({ page }) => {
  await addModule(page, "Seq");
  await page.getByRole("button", { name: "Composer" }).click();
  await page.getByRole("tab", { name: "Perform" }).click();
  await performPanel(page).getByRole("button", { name: "Hide Seq" }).click();

  await page.reload();
  await page.getByRole("button", { name: "Composer" }).click();
  await page.getByRole("tab", { name: "Perform" }).click();

  await expect(performPanel(page).getByRole("group", { name: "Patterns of Seq" })).toHaveCount(0);
  await expect(performPanel(page).getByRole("button", { name: "Show Seq" })).toBeVisible();
});

test("saves the patterns playing as a scene, and launches it back", async ({ page }) => {
  await setTempo(page, 300);
  await addModule(page, "Seq");
  await page.getByRole("button", { name: "Composer" }).click();
  await page.getByRole("tab", { name: "Perform" }).click();
  const panel = performPanel(page);
  const row = panel.getByRole("group", { name: "Patterns of Seq" });
  await page.getByRole("button", { name: "Start audio" }).click();
  await row.getByRole("button", { name: "Pattern A5" }).click();
  await expect(row.getByRole("button", { name: "Pattern A5" })).toHaveAttribute("data-playing", "true", { timeout: 3000 });

  await panel.getByRole("button", { name: "Save scene" }).click();
  await expect(panel.getByRole("button", { name: "Launch Scene 1" })).toHaveAttribute("data-playing", "true");
  await row.getByRole("button", { name: "Pattern A2" }).click();
  await expect(row.getByRole("button", { name: "Pattern A2" })).toHaveAttribute("data-playing", "true", { timeout: 3000 });
  await panel.getByRole("button", { name: "Launch Scene 1" }).click();

  await expect(row.getByRole("button", { name: "Pattern A5" })).toHaveAttribute("data-playing", "true", { timeout: 3000 });
  await expect(panel.getByRole("button", { name: "Launch Scene 1" })).toHaveAttribute("data-playing", "true");
  await page.getByRole("button", { name: "Stop" }).click();
});

test("pins a mixer and mutes a channel from its column, across a reload", async ({ page }) => {
  await addModule(page, "Noise");
  await addModule(page, "Mixer");
  await connect(page, ["noise-1", "audio"], ["mixer-2", "audio"]);
  await node(page, "mixer-2").getByRole("slider", { name: /level$/ }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Pin to Perform" }).click();
  await page.getByRole("button", { name: "Composer" }).click();
  await page.getByRole("tab", { name: "Perform" }).click();

  await performPanel(page).getByRole("button", { name: "Mute Mixer › Noise 1" }).click();

  await expect(node(page, "mixer-2").getByRole("button", { name: /^Mute/ })).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await page.getByRole("button", { name: "Composer" }).click();
  await page.getByRole("tab", { name: "Perform" }).click();
  await expect(performPanel(page).getByRole("button", { name: "Mute Mixer › Noise 1" })).toHaveAttribute("aria-pressed", "true");
});

test("plays full screen without the editor, and brings it back where it was", async ({ page }) => {
  await setTempo(page, 300);
  await addModule(page, "Seq");
  const viewport = page.locator(".react-flow__viewport");
  await page.getByRole("button", { name: "Zoom In" }).click();
  await expect.poll(() => viewport.evaluate((element) => element.style.transform)).toContain("scale(1.2");
  const before = await viewport.evaluate((element) => element.style.transform);
  await page.getByRole("button", { name: "Composer" }).click();
  await page.getByRole("tab", { name: "Perform" }).click();

  await page.getByRole("button", { name: "Full screen" }).click();
  await expect(page.locator(".react-flow")).toHaveCount(0);
  await page.getByRole("button", { name: "Start audio" }).click();
  const row = performPanel(page).getByRole("group", { name: "Patterns of Seq" });
  await row.getByRole("button", { name: "Pattern A3" }).click();
  await expect(row.getByRole("button", { name: "Pattern A3" })).toHaveAttribute("data-playing", "true", { timeout: 3000 });

  await page.keyboard.press("Escape");
  await expect(viewport).toHaveCount(1);
  expect(await viewport.evaluate((element) => element.style.transform)).toBe(before);
  await page.getByRole("button", { name: "Stop" }).click();
});

test("takes the knobs from one scene to another with the crossfader, and writes them into the patch with Apply", async ({ page }) => {
  await addModule(page, "Seq");
  await addModule(page, "Filter");
  await pin(page, "filter-2", "Freq");
  await page.getByRole("button", { name: "Composer" }).click();
  await page.getByRole("tab", { name: "Perform" }).click();
  const panel = performPanel(page);
  const knob = panel.getByRole("slider", { name: "Filter › Freq" });
  await setParam(page, "filter-2", "Freq", 200);
  await panel.getByRole("button", { name: "Save scene" }).click();
  await setParam(page, "filter-2", "Freq", 2000);
  await panel.getByRole("button", { name: "Save scene" }).click();

  await panel.getByRole("combobox", { name: "Scene A" }).selectOption("Scene 1");
  await panel.getByRole("combobox", { name: "Scene B" }).selectOption("Scene 2");
  await panel.getByRole("slider", { name: "Crossfader" }).fill("0");
  await expect(knob).toHaveAttribute("aria-valuenow", "200");

  await panel.getByRole("combobox", { name: "Scene A" }).selectOption("—");
  await panel.getByRole("combobox", { name: "Scene B" }).selectOption("—");
  await expect(knob).toHaveAttribute("aria-valuenow", "2000");

  await panel.getByRole("combobox", { name: "Scene A" }).selectOption("Scene 1");
  await panel.getByRole("button", { name: "Apply" }).click();
  await panel.getByRole("combobox", { name: "Scene A" }).selectOption("—");
  await expect(knob).toHaveAttribute("aria-valuenow", "200");
});
