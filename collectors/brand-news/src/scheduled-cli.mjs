import { readFile } from "node:fs/promises";
import { runCollection, saveJson } from "./runner.mjs";
import { createDataStore } from "./github-data.mjs";
import { createPublicSnapshot, publicState } from "./public-snapshot.mjs";

const store = createDataStore({ repository: process.env.GITHUB_REPOSITORY, token: process.env.GH_TOKEN });
const restored = await store.restore();
const stateFile = "data/scheduled-state.json";
const bootstrap = JSON.parse(await readFile(new URL("../bootstrap/state.json", import.meta.url), "utf8"));
await saveJson(stateFile, restored.state ?? bootstrap);
const result = await runCollection({ stateFile });
const state = publicState(result.state);
const snapshot = createPublicSnapshot(state);
// Partial results and cooldowns persist before failing the job. A failure never
// erases existing good posts. There is no automatic authentication fallback.
const sha = await store.publish({ sha: restored.sha, state, snapshot });
console.log(JSON.stringify({ sha, records: snapshot.records.length, requestedSources: result.requestedSources, failedSources: result.failures }));
if (result.failures) process.exitCode = 1;
