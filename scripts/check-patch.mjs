import { readFile } from "node:fs/promises";
import { runnerImport } from "vite";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Usage: npm run check-patch -- <piece.json>...");
  process.exit(2);
}

const { module } = await runnerImport("/src/patch/check.ts");
let failed = false;
for (const file of files) {
  let problems;
  try {
    problems = module.checkPatch(JSON.parse(await readFile(file, "utf8")));
  } catch (error) {
    problems = [`It is not JSON: ${error.message}`];
  }
  failed ||= problems.length > 0;
  console.log(problems.length === 0 ? `✓ ${file}` : `✗ ${file}\n${problems.map((problem) => `  - ${problem}`).join("\n")}`);
}
process.exit(failed ? 1 : 0);
