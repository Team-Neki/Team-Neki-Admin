import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { collectCandidates } from "./collect.mjs";
import { mergeCandidates } from "./merge.mjs";
import { selectedPages } from "./collection-scope.mjs";
import { applyCollectionOutcome, sourceHasFailure } from "./collection-policy.mjs";

export async function saveJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
    await rename(temporaryPath, path);
  } finally {
    await unlink(temporaryPath).catch((error) => { if (error.code !== "ENOENT") throw error; });
  }
}

function validateState(state) {
  if (state.schemaVersion !== 1 || !Array.isArray(state.records) || !Array.isArray(state.diagnostics)) throw new Error("Invalid state file; refusing to overwrite it");
  if (state.records.some((record) => !record.id || !record.sourceKey || !record.fingerprint)) throw new Error("Invalid state records");
  return state;
}

export async function runCollection({ stateFile, outputFile, pages = selectedPages, force = false, minIntervalMs = 6 * 60 * 60 * 1000, fetchImpl = fetch, browserFetchImpl, observedAt = new Date().toISOString() } = {}) {
  if (!stateFile) throw new Error("A state file is required");
  if (!Number.isFinite(Date.parse(observedAt)) || !Number.isFinite(minIntervalMs) || minIntervalMs < 0) throw new Error("Invalid collection time or interval");
  const statePath = resolve(stateFile);
  if (outputFile && resolve(outputFile) === statePath) throw new Error("Snapshot and state paths must differ");
  const lockPath = `${statePath}.lock`;
  await mkdir(dirname(statePath), { recursive: true });
  let lock;
  try { lock = await open(lockPath, "wx"); }
  catch (error) {
    if (error.code === "EEXIST") throw new Error(`Collection already locked: ${lockPath}`);
    throw error;
  }
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: observedAt }));
    let previous = null;
    try { previous = validateState(JSON.parse(await readFile(statePath, "utf8"))); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    const diagnosticsByKey = new Map((previous?.diagnostics ?? []).map((item) => [item.sourceKey, item]));
    const due = [];
    const cached = [];
    for (const page of pages) {
      const earlier = diagnosticsByKey.get(page.key);
      const elapsed = Date.parse(observedAt) - Date.parse(earlier?.lastSuccessAt ?? "");
      const hasRecords = previous?.records.some((record) => record.sourceKey === page.key);
      if (Date.parse(earlier?.nextAttemptAt ?? "") > Date.parse(observedAt)) {
        cached.push({ ...earlier, status: "deferred" });
      } else if (!force && hasRecords && !sourceHasFailure(earlier) && Number.isFinite(elapsed) && elapsed >= 0 && elapsed < minIntervalMs) {
        cached.push({ ...earlier, status: "cached" });
      } else due.push(page);
    }
    const snapshot = await collectCandidates({ pages: due, fetchImpl, browserFetchImpl, previous, observedAt });
    snapshot.diagnostics = [...snapshot.diagnostics.map((item) => applyCollectionOutcome(item, diagnosticsByKey.get(item.sourceKey), observedAt)), ...cached];
    snapshot.candidates.push(...(previous?.records ?? []).filter((record) => cached.some((source) => source.sourceKey === record.sourceKey)));
    const merged = mergeCandidates(previous, snapshot);
    merged.state.diagnostics = [...diagnosticsByKey.values()].filter((item) => !pages.some((page) => page.key === item.sourceKey)).concat(snapshot.diagnostics);
    if (outputFile) await saveJson(resolve(outputFile), snapshot);
    // Good sources update independently; a failed source never loses its records.
    await saveJson(statePath, merged.state);
    return { ...merged, snapshot, requestedSources: due.length, cachedSources: cached.length, failures: snapshot.diagnostics.filter(sourceHasFailure).length };
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}
