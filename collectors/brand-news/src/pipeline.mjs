import { readFile } from "node:fs/promises";
import { runCollection } from "./runner.mjs";
import { normalizeRecords } from "./normalize.mjs";
import { profileDataset } from "./quality.mjs";
import { writeArtifacts } from "./artifacts.mjs";
import { selectedBrands, selectedPages, selectSourceRecords } from "./collection-scope.mjs";
import { sourceHasFailure } from "./collection-policy.mjs";

export async function runPipeline({ stateFile, outputDir, offline = false, force = false, fetchImpl = fetch, generatedAt = new Date().toISOString() } = {}) {
  if (!stateFile || !outputDir) throw new Error("State file and artifact directory are required");
  let collection;
  let state;
  if (offline) {
    state = JSON.parse(await readFile(stateFile, "utf8"));
    if (state.schemaVersion !== 1 || !Array.isArray(state.records) || !Array.isArray(state.diagnostics)) throw new Error("Invalid source state");
  } else {
    collection = await runCollection({ stateFile, force, fetchImpl, observedAt: generatedAt });
    state = collection.state;
  }
  const sourceRecords = selectSourceRecords(state.records);
  const diagnostics = state.diagnostics.filter((source) => selectedPages.some((page) => page.key === source.sourceKey));
  const dataset = normalizeRecords(sourceRecords, { generatedAt });
  const quality = profileDataset(dataset, diagnostics, selectedBrands);
  const run = {
    schemaVersion: 1, generatedAt, mode: offline ? "offline" : collection.requestedSources ? "collection" : "cache",
    sourceStateLastRunAt: state.lastRunAt ?? null,
    requestedSources: collection?.requestedSources ?? 0, cachedSources: collection?.cachedSources ?? 0,
    failures: collection?.failures ?? diagnostics.filter(sourceHasFailure).length,
    inserted: collection?.inserted ?? null, changed: collection?.changed ?? null,
    insertedIds: collection?.insertedIds ?? [], changedIds: collection?.changedIds ?? [], diagnostics,
  };
  const artifacts = await writeArtifacts({ outputDir, sourceRecords, dataset, quality, run });
  return { ...artifacts, quality, run, passed: run.failures === 0 && Object.values(quality.checks).every(Boolean) && quality.counts.normalized > 0 };
}
