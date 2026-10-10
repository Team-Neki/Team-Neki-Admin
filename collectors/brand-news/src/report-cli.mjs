import { parseArgs } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { normalizeRecords } from "./normalize.mjs";
import { profileDataset } from "./quality.mjs";
import { selectedBrands, selectSourceRecords } from "./collection-scope.mjs";
import { renderHtmlReport } from "./html-report.mjs";

try {
  const { values } = parseArgs({ options: {
    state: { type: "string", default: "data/state.json" },
    output: { type: "string", default: "data/brand-news-report.html" },
  } });
  const state = JSON.parse(await readFile(values.state, "utf8"));
  if (state.schemaVersion !== 1 || !Array.isArray(state.records)) throw new Error("Invalid source state");
  const dataset = normalizeRecords(selectSourceRecords(state.records));
  const quality = profileDataset(dataset, state.diagnostics ?? [], selectedBrands);
  const output = resolve(values.output);
  if (output === resolve(values.state) || !output.endsWith(".html")) throw new Error("Output must be a separate HTML file");
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, renderHtmlReport(dataset, quality));
  process.stdout.write(`${JSON.stringify({ output, brands: selectedBrands.map((brand) => brand.brand), storedRecords: dataset.records.length, requestedSources: 0 }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
