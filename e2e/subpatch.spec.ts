import { expect, test, type Page } from "@playwright/test";
import { addModule, connect, example, loadPatchFile, node, openApp, signalLevel } from "./support";

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

const path = (page: Page) => page.getByRole("navigation", { name: "Subpatches" });

test("builds a subpatch that lets a sound through, and keeps it after a reload", async ({ page }) => {
  await addModule(page, "Subpatch");
  await node(page, "subpatch-1").getByRole("button", { name: "Open" }).click();
  await expect(path(page)).toHaveText("Patch›Subpatch 1");
  await addModule(page, "In");
  await addModule(page, "Filter");
  await addModule(page, "Out");
  await connect(page, ["inlet-2", "out"], ["filter-3", "audio"]);
  await connect(page, ["filter-3", "audio"], ["outlet-4", "in"]);

  await path(page).getByRole("button", { name: "Patch" }).click();
  await expect(path(page)).toBeHidden();
  await expect(node(page, "subpatch-1")).toContainText("3 modules");
  await addModule(page, "Oscillator");
  await addModule(page, "Output");
  await connect(page, ["oscillator-5", "audio"], ["subpatch-1", "inlet-2"]);
  await connect(page, ["subpatch-1", "outlet-4"], ["output-6", "audio"]);
  await page.getByRole("button", { name: "Start audio" }).click();

  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.1);

  await page.waitForTimeout(700);
  await page.reload();
  await node(page, "subpatch-1").getByRole("button", { name: "Open" }).click();
  await expect(node(page, "filter-3")).toBeVisible();
});

test("leaves room under the header of a new subpatch, before what it holds", async ({ page }) => {
  await addModule(page, "Subpatch");
  const header = (await node(page, "subpatch-1").locator(".module-header").boundingBox())!;
  const open = (await node(page, "subpatch-1").locator(".subpatch-open").boundingBox())!;
  const button = (await node(page, "subpatch-1").getByRole("button", { name: "Open" }).boundingBox())!;

  expect(button.y - (header.y + header.height)).toBeGreaterThanOrEqual(8);
  expect(open.y + open.height - (button.y + button.height)).toBeGreaterThanOrEqual(8);
});

test("draws what plays inside a subpatch, like the step of a Seq", async ({ page }) => {
  await addModule(page, "Subpatch");
  await node(page, "subpatch-1").getByRole("button", { name: "Open" }).click();
  await addModule(page, "Seq");
  await page.getByRole("button", { name: "Start audio" }).click();

  await expect(node(page, "sequencer-2").locator(".step-cell-playing").first()).toBeVisible();
});

test("groups the selected modules into a subpatch that sounds the same, as one undo step", async ({ page }) => {
  await addModule(page, "Oscillator");
  await addModule(page, "Filter");
  await addModule(page, "Gain");
  await addModule(page, "Output");
  await connect(page, ["oscillator-1", "audio"], ["filter-2", "audio"]);
  await connect(page, ["filter-2", "audio"], ["gain-3", "audio"]);
  await connect(page, ["gain-3", "audio"], ["output-4", "audio"]);
  await page.getByRole("button", { name: "Start audio" }).click();
  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.1);

  await node(page, "filter-2").locator(".module-header").click();
  await page.keyboard.down("Meta");
  await node(page, "gain-3").locator(".module-header").click();
  await page.keyboard.up("Meta");
  await page.getByRole("button", { name: "Group" }).click();

  await expect(node(page, "filter-2")).toHaveCount(0);
  const group = page.locator('.react-flow__node[data-id^="subpatch-"]');
  await expect(group).toContainText("4 modules");
  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.1);

  await group.getByRole("button", { name: "Open" }).click();
  await expect(node(page, "filter-2")).toBeVisible();
  await expect(node(page, "gain-3")).toBeVisible();

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(path(page)).toBeHidden();
  await expect(node(page, "filter-2")).toBeVisible();
  await expect(group).toHaveCount(0);
});

test("sets a control In from a knob outside the subpatch, the same value as inside", async ({ page }) => {
  await loadPatchFile(page, example("21-subpatch"));
  const cutoff = node(page, "subpatch-2").getByRole("slider", { name: "cutoff" });
  await expect(cutoff).toHaveAttribute("aria-valuenow", "0.2");

  await cutoff.focus();
  await page.keyboard.press("Shift+ArrowUp");
  await expect(cutoff).toHaveAttribute("aria-valuenow", "0.3");

  await node(page, "subpatch-2").getByRole("button", { name: "Open" }).click();
  await expect(node(page, "inlet-11").getByRole("slider", { name: "Value" })).toHaveAttribute("aria-valuenow", "0.3");
});

test("plays the example of subpatches without the keyboard", async ({ page }) => {
  await loadPatchFile(page, example("21-subpatch"));
  await expect(node(page, "output-3")).toBeVisible();

  await page.getByRole("button", { name: "Start audio" }).click();

  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.05);
});

test("publishes a param from inside a subpatch and sets it from outside, the same value as inside", async ({ page }) => {
  await addModule(page, "Subpatch");
  await node(page, "subpatch-1").getByRole("button", { name: "Open" }).click();
  await addModule(page, "ADSR");
  const release = node(page, "envelope-2").getByRole("button", { name: "Publish R" });
  await node(page, "envelope-2").getByText("R", { exact: true }).hover();
  await release.click();
  await expect(release).toHaveAttribute("aria-pressed", "true");

  await path(page).getByRole("button", { name: "Patch" }).click();
  const knob = node(page, "subpatch-1").getByRole("slider", { name: "ADSR R" });
  await expect(knob).toHaveAttribute("aria-valuenow", "0.5");
  await node(page, "subpatch-1").getByText("ADSR R").dblclick();
  await node(page, "subpatch-1").getByRole("textbox", { name: "Name of ADSR R" }).fill("Decay");
  await page.keyboard.press("Enter");
  const decay = node(page, "subpatch-1").getByRole("slider", { name: "Decay" });
  await decay.focus();
  await page.keyboard.press("Enter");
  const input = node(page, "subpatch-1").getByRole("textbox", { name: "Decay" });
  await input.fill("0.2");
  await input.press("Enter");

  await node(page, "subpatch-1").getByRole("button", { name: "Open" }).click();
  await expect(node(page, "envelope-2").getByRole("slider", { name: "R", exact: true })).toHaveAttribute("aria-valuenow", "0.2");
});

test("publishes again a knob of a subpatch inside a subpatch on the one outside, and sets it from the top", async ({ page }) => {
  await addModule(page, "Subpatch");
  await node(page, "subpatch-1").getByRole("button", { name: "Open" }).click();
  await addModule(page, "Subpatch");
  await node(page, "subpatch-2").getByRole("button", { name: "Open" }).click();
  await addModule(page, "ADSR");
  await node(page, "envelope-3").getByText("R", { exact: true }).hover();
  await node(page, "envelope-3").getByRole("button", { name: "Publish R" }).click();

  await path(page).getByRole("button", { name: "Subpatch 1" }).click();
  const publish = node(page, "subpatch-2").getByRole("button", { name: "Publish ADSR R" });
  await node(page, "subpatch-2").getByText("ADSR R").hover();
  await publish.click();
  await expect(publish).toHaveAttribute("aria-pressed", "true");

  await path(page).getByRole("button", { name: "Patch" }).click();
  const knob = node(page, "subpatch-1").getByRole("slider", { name: "Subpatch ADSR R" });
  await expect(knob).toHaveAttribute("aria-valuenow", "0.5");
  await knob.focus();
  await page.keyboard.press("Enter");
  const input = node(page, "subpatch-1").getByRole("textbox", { name: "Subpatch ADSR R" });
  await input.fill("0.2");
  await input.press("Enter");

  await node(page, "subpatch-1").getByRole("button", { name: "Open" }).click();
  await node(page, "subpatch-2").getByRole("button", { name: "Open" }).click();
  await expect(node(page, "envelope-3").getByRole("slider", { name: "R", exact: true })).toHaveAttribute("aria-valuenow", "0.2");
});

test("publishes a clip from inside a subpatch and draws on its piano roll from outside, up and down the subpatches", async ({ page }) => {
  await addModule(page, "Subpatch");
  await node(page, "subpatch-1").getByRole("button", { name: "Open" }).click();
  await addModule(page, "Clip");
  await node(page, "clip-2").getByRole("button", { name: "Publish Notes" }).click();
  await path(page).getByRole("button", { name: "Patch" }).click();
  const roll = page.getByRole("application", { name: "Piano roll" });
  const notes = node(page, "subpatch-1").getByRole("img", { name: "Clip notes" }).locator("[data-clip-note]");
  const before = await notes.count();

  await node(page, "subpatch-1").getByRole("button", { name: "Edit" }).click();
  await expect(roll).toBeVisible();
  const box = (await roll.boundingBox())!;
  const beat = parseFloat(await roll.evaluate((element) => element.style.getPropertyValue("--beat")));
  await page.mouse.move(box.x + 2, box.y + 28 * 16 + 8);
  await page.mouse.down();
  await page.mouse.move(box.x + 3 * beat + 2, box.y + 28 * 16 + 8, { steps: 6 });
  await page.mouse.up();
  await expect(notes).toHaveCount(before + 1);

  await node(page, "subpatch-1").getByRole("button", { name: "Open" }).click();
  await expect(roll).toBeVisible();
  await expect(node(page, "clip-2").getByRole("img", { name: "Clip notes" }).locator("[data-clip-note]")).toHaveCount(before + 1);
});

test("programs a Drums from outside its subpatch, and launches its patterns there into the song with Rec", async ({ page }) => {
  await addModule(page, "Subpatch");
  await node(page, "subpatch-1").getByRole("button", { name: "Open" }).click();
  await addModule(page, "Drums");
  await node(page, "drums-2").getByRole("button", { name: "Publish Rows" }).click();
  await path(page).getByRole("button", { name: "Patch" }).click();
  const face = node(page, "subpatch-1");
  const patterns = face.getByRole("group", { name: "Patterns" });

  await patterns.getByRole("button", { name: "Pattern A2" }).click();
  await face.getByRole("group", { name: "Open" }).getByRole("button", { name: "Step 3" }).click();
  await expect(face.getByRole("group", { name: "Open" }).getByRole("button", { name: "Step 3" })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Composer" }).click();
  const panel = page.getByRole("region", { name: "Song panel" });
  await panel.getByRole("button", { name: "Rec" }).click();
  await patterns.getByRole("button", { name: "Pattern A2" }).dblclick();
  await panel.getByRole("button", { name: "Rec" }).click();
  await expect(panel.getByRole("button", { name: /Drums, bar 1/ })).toHaveText("A2");

  await face.getByRole("button", { name: "Open", exact: true }).click();
  await node(page, "drums-2").getByRole("group", { name: "Patterns" }).getByRole("button", { name: "Pattern A2" }).click();
  await expect(node(page, "drums-2").getByRole("group", { name: "Open" }).getByRole("button", { name: "Step 3" })).toHaveAttribute("aria-pressed", "true");
  await node(page, "drums-2").getByRole("group", { name: "Patterns" }).getByRole("button", { name: "Pattern A1" }).click();
  await expect(node(page, "drums-2").getByRole("group", { name: "Open" }).getByRole("button", { name: "Step 3" })).toHaveAttribute("aria-pressed", "false");
});

test("arranges the face of a subpatch in sections, and keeps it after a reload", async ({ page }) => {
  await addModule(page, "Subpatch");
  await node(page, "subpatch-1").getByRole("button", { name: "Open" }).click();
  await addModule(page, "ADSR");
  for (const label of ["A", "D", "R"]) {
    await node(page, "envelope-2").getByText(label, { exact: true }).hover();
    await node(page, "envelope-2").getByRole("button", { name: `Publish ${label}` }).click();
  }
  await path(page).getByRole("button", { name: "Patch" }).click();
  const face = node(page, "subpatch-1");
  const knobs = () => face.getByRole("slider").evaluateAll((sliders) => sliders.map((slider) => slider.getAttribute("aria-label")));

  await face.getByRole("slider", { name: "ADSR D" }).hover();
  await face.getByRole("button", { name: "Move ADSR D" }).click();
  await face.getByRole("menuitem", { name: "New section here" }).click();
  await face.getByText("Section", { exact: true }).dblclick();
  await face.getByRole("textbox", { name: "Name of section Section" }).fill("Tail");
  await page.keyboard.press("Enter");
  await face.getByRole("slider", { name: "ADSR A" }).hover();
  await face.getByRole("button", { name: "Move ADSR A" }).dragTo(face.getByRole("slider", { name: "ADSR R" }));

  await expect.poll(knobs).toEqual(["ADSR D", "ADSR R", "ADSR A", "Voices"]);
  await expect(face.getByRole("heading", { name: "Tail" })).toBeVisible();
  await page.waitForTimeout(700);
  await page.reload();
  await expect.poll(knobs).toEqual(["ADSR D", "ADSR R", "ADSR A", "Voices"]);
  await expect(node(page, "subpatch-1").getByRole("heading", { name: "Tail" })).toBeVisible();
});

test("plays the example of drums with the knobs of each drum on its subpatch", async ({ page }) => {
  await loadPatchFile(page, example("34-acid-techno"));

  await expect(node(page, "subpatch-2").getByRole("slider", { name: "Tune" })).toHaveAttribute("aria-valuenow", "48");
  await expect(node(page, "subpatch-3").getByRole("slider", { name: "Decay" })).toHaveAttribute("aria-valuenow", "0.22");
});
