import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { addModule, example, node, openApp } from "./support";

const keepAsAudiojac = async (page: Page, patch: string) => {
  await page.goto("/favicon.svg");
  await page.evaluate(
    (patch) =>
      new Promise<void>((resolve, reject) => {
        localStorage.setItem("audiojac:patch", patch);
        localStorage.setItem("audiojac:theme", "dark");
        const open = indexedDB.open("audiojac", 2);
        open.onupgradeneeded = () => {
          open.result.createObjectStore("samples", { keyPath: "id" });
          open.result.createObjectStore("presets", { keyPath: "id" });
        };
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const database = open.result;
          const write = database.transaction("presets", "readwrite");
          write.objectStore("presets").put({ id: "preset-old", name: "Old dark", node: { type: "filter", params: { frequency: 300 } } });
          write.oncomplete = () => {
            database.close();
            resolve();
          };
          write.onerror = () => reject(write.error);
        };
      }),
    patch,
  );
};

const databaseNames = (page: Page) => page.evaluate(async () => (await indexedDB.databases()).map(({ name }) => name).sort());

test("keeps the patch, the theme and the presets kept when the app was called audiojac", async ({ page }) => {
  await keepAsAudiojac(page, await readFile(example("06-wind"), "utf8"));

  await openApp(page);

  await expect(node(page, "output-5")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await addModule(page, "Filter");
  await node(page, "filter-6").getByRole("button", { name: "Presets of Filter" }).click();
  await expect(page.getByRole("dialog", { name: "Presets of Filter" }).getByRole("button", { name: "Old dark", exact: true })).toBeVisible();
  expect(await page.evaluate(() => [localStorage.getItem("audiojac:patch"), localStorage.getItem("audiojac:theme")])).toEqual([null, null]);
  await expect.poll(() => databaseNames(page)).toEqual(["trama"]);
});
