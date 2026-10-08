import { expect, test } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { addModule, edge, edgeIds, example, loadPatchFile, node, openApp } from "./support";

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test("loads an example patch", async ({ page }) => {
  const patch = JSON.parse(await readFile(example("01-basic-synth"), "utf8"));

  await loadPatchFile(page, example("01-basic-synth"));

  for (const { id } of patch.nodes) {
    await expect(node(page, id)).toBeVisible();
  }
  await expect.poll(() => edgeIds(page)).toEqual(patch.connections.map(({ id }: { id: string }) => id));
  await expect(edge(page, "keyboard-1:gate->envelope-5:gate")).toHaveClass(/edge-trigger/);
  await expect(page.locator(".amount-control output")).toHaveText(["1.00", "1.00", "0.40"]);
});

test("saves the current patch as it was loaded", async ({ page }) => {
  await loadPatchFile(page, example("03-wobble-bass"));
  await expect(node(page, "lfo-5")).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Save" }).click(),
  ]);

  expect(download.suggestedFilename()).toBe("wobble-bass.json");
  const saved = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(saved).toEqual(JSON.parse(await readFile(example("03-wobble-bass"), "utf8")));
});

test("saves the patch file, not the page, with the save shortcut", async ({ page }) => {
  await loadPatchFile(page, example("03-wobble-bass"));
  await expect(node(page, "lfo-5")).toBeVisible();

  const [download] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("ControlOrMeta+s")]);

  expect(download.suggestedFilename()).toBe("wobble-bass.json");
  const saved = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(saved).toEqual(JSON.parse(await readFile(example("03-wobble-bass"), "utf8")));
});

test("replaces the current patch on load", async ({ page }) => {
  await addModule(page, "Noise");
  await expect(node(page, "noise-1")).toBeVisible();

  await loadPatchFile(page, example("06-wind"));

  await expect(page.locator(".react-flow__node")).toHaveCount(5);
  await expect(node(page, "filter-3")).toBeVisible();
});

test("reports an invalid file and keeps the current patch", async ({ page }, testInfo) => {
  const file = testInfo.outputPath("broken.json");
  await writeFile(file, JSON.stringify({ version: 1, nodes: [{ id: "x-1", type: "theremin" }], connections: [] }));
  await addModule(page, "Gain");

  await loadPatchFile(page, file);

  await expect(page.getByRole("alert")).toHaveText('Node "x-1" has an unknown type "theremin"');
  await expect(node(page, "gain-1")).toBeVisible();
});

test("keeps adding modules after the ids of a loaded patch", async ({ page }) => {
  await loadPatchFile(page, example("06-wind"));
  await expect(node(page, "output-5")).toBeVisible();

  await addModule(page, "Delay");

  await expect(node(page, "delay-6")).toBeVisible();
});

test("joins the buttons of the patch file, the Examples one too, rounded only at the ends", async ({ page }) => {
  const group = page.getByRole("group", { name: "Patch file" });
  const buttons = ["New", "Save", "Load", "Examples"].map((name) => group.getByRole("button", { name, exact: true }));
  const boxes = await Promise.all(buttons.map(async (button) => (await button.boundingBox())!));
  const corners = await Promise.all(
    buttons.map((button) =>
      button.evaluate((element) => {
        const style = getComputedStyle(element);
        return [style.borderTopLeftRadius, style.borderTopRightRadius].map((radius) => parseFloat(radius) > 0);
      }),
    ),
  );

  for (let index = 1; index < boxes.length; index++) {
    expect(boxes[index].x).toBeCloseTo(boxes[index - 1].x + boxes[index - 1].width - 1, 0);
  }
  expect(corners).toEqual([
    [true, false],
    [false, false],
    [false, false],
    [false, true],
  ]);
});
