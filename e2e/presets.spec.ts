import { expect, test, type Page } from "@playwright/test";
import { addModule, node, openApp, setParam } from "./support";

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

const storedPresetNames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const open = indexedDB.open("trama");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const database = open.result;
          if (!database.objectStoreNames.contains("presets")) {
            database.close();
            return resolve([]);
          }
          const all = database.transaction("presets", "readonly").objectStore("presets").getAll();
          all.onerror = () => reject(all.error);
          all.onsuccess = () => {
            database.close();
            resolve(all.result.map((preset: { name: string }) => preset.name));
          };
        };
      }),
  );

const savePreset = async (page: Page, nodeId: string, title: string, name: string) => {
  await node(page, nodeId).getByRole("button", { name: `Presets of ${title}` }).click();
  await page.getByRole("textbox", { name: "Preset name" }).fill(name);
  await page.getByRole("button", { name: "Save preset" }).click();
  await expect.poll(() => storedPresetNames(page)).toContain(name);
};

const frequency = (page: Page, nodeId: string) => node(page, nodeId).getByRole("slider", { name: "Freq" });

test("saves the settings of a node as a preset, and gives them to another node, after a reload too", async ({ page }) => {
  await addModule(page, "Filter");
  await setParam(page, "filter-1", "Freq", 300);
  await savePreset(page, "filter-1", "Filter", "Dark");

  await page.reload();
  await addModule(page, "Filter");
  await expect(frequency(page, "filter-2")).toHaveAttribute("aria-valuenow", "1200");
  await node(page, "filter-2").getByRole("button", { name: "Presets of Filter" }).click();
  await page.getByRole("dialog", { name: "Presets of Filter" }).getByRole("button", { name: "Dark", exact: true }).click();

  await expect(frequency(page, "filter-2")).toHaveAttribute("aria-valuenow", "300");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(frequency(page, "filter-2")).toHaveAttribute("aria-valuenow", "1200");
});

test("adds a subpatch saved as a module of its own from the menu of modules", async ({ page }) => {
  await addModule(page, "Subpatch");
  await node(page, "subpatch-1").getByRole("button", { name: "Open" }).click();
  await addModule(page, "Noise");
  await addModule(page, "Gain");
  await page.getByRole("button", { name: "Patch", exact: true }).click();
  await savePreset(page, "subpatch-1", "Subpatch", "Hiss");

  await page.reload();
  await page.getByRole("button", { name: "Add module" }).click();
  await page.getByRole("group", { name: "My modules" }).getByRole("option", { name: "Hiss" }).click();

  const added = page.locator(".react-flow__node").filter({ hasText: "Hiss" });
  await expect(added).toContainText("2 modules");
});

test("exports the presets to a file, and imports them back", async ({ page }) => {
  await addModule(page, "Filter");
  await setParam(page, "filter-1", "Freq", 300);
  await savePreset(page, "filter-1", "Filter", "Dark");
  await setParam(page, "filter-1", "Freq", 800);

  await node(page, "filter-1").getByRole("button", { name: "Presets of Filter" }).click();
  const menu = page.getByRole("dialog", { name: "Presets of Filter" });
  const [download] = await Promise.all([page.waitForEvent("download"), menu.getByRole("button", { name: "Export all" }).click()]);
  expect(download.suggestedFilename()).toBe("trama-presets.json");
  const file = (await download.path())!;

  await menu.getByRole("button", { name: "Delete preset Dark" }).click();
  await expect(menu.getByText("No Filter presets yet")).toBeVisible();
  await page.getByLabel("Import presets file").setInputFiles(file);

  await expect(menu.getByRole("status", { name: "Presets file" })).toHaveText("Imported 1 preset");
  await menu.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(frequency(page, "filter-1")).toHaveAttribute("aria-valuenow", "300");
});
