import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import { saveJson } from "./runner.mjs";
import { createPublicSnapshot } from "./public-snapshot.mjs";

const { values } = parseArgs({ options: {
  state: { type: "string", default: "data/state.json" },
  output: { type: "string", default: "data/brand-news.json" },
} });
const snapshot = createPublicSnapshot(JSON.parse(await readFile(values.state, "utf8")));
await saveJson(values.output, snapshot);
console.log(JSON.stringify({ records: snapshot.records.length, generatedAt: snapshot.generatedAt, output: values.output }));
