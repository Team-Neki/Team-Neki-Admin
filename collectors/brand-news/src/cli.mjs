import { parseArgs } from "node:util";
import { runCollection } from "./runner.mjs";
import { selectedPages as collectionPages, selectSourceRecords } from "./collection-scope.mjs";

try {
  const { values } = parseArgs({ options: {
    state: { type: "string", default: "data/state.json" },
    output: { type: "string", default: "data/latest.json" },
    source: { type: "string", multiple: true },
    force: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  } });
  if (values.help) {
    process.stdout.write("npm run collect -- [--state path] [--output path] [--source key] [--force]\n");
    process.stdout.write(`Sources: ${collectionPages.map((page) => page.key).join(", ")}\n`);
  } else {
    const sources = values.source;
    if (sources?.some((key) => !collectionPages.some((page) => page.key === key))) throw new Error("Unknown source; use --help");
    const result = await runCollection({
      stateFile: values.state, outputFile: values.output, force: values.force,
      pages: sources ? collectionPages.filter((page) => sources.includes(page.key)) : collectionPages,
    });
    process.stdout.write(`${JSON.stringify({ inserted: result.inserted, changed: result.changed, stored: selectSourceRecords(result.state.records).length, requestedSources: result.requestedSources, cachedSources: result.cachedSources, failures: result.failures, diagnostics: result.snapshot.diagnostics }, null, 2)}\n`);
    if (result.failures) process.exitCode = 1;
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
