import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createPublicSnapshot, publicState } from "../src/public-snapshot.mjs";
import { createDataStore } from "../src/github-data.mjs";

const bootstrap = JSON.parse(await readFile(new URL("../bootstrap/state.json", import.meta.url), "utf8"));

test("initial public snapshot reconciles all six brands without private artifacts", () => {
  const state = publicState({ ...bootstrap, cookies: "DO-NOT-PUBLISH", diagnostics: bootstrap.diagnostics.map((item) => ({ ...item, message: "DO-NOT-PUBLISH", headers: { Authorization: "DO-NOT-PUBLISH" } })) });
  const snapshot = createPublicSnapshot(state);
  assert.equal(snapshot.records.length, 196);
  assert.equal(snapshot.sources.length, 6);
  assert.equal(snapshot.sources.reduce((sum, source) => sum + source.recordCount, 0), 196);
  assert.doesNotMatch(JSON.stringify(state), /DO-NOT-PUBLISH/);
  assert.equal(snapshot.sources.find((source) => source.brandName === "포토그레이").failureCode, "rate-limited");
  assert.ok(snapshot.records.every((record) => Array.isArray(record.imageUrls)));
  assert.ok(snapshot.records.some((record) => record.brandName === "하루필름" && record.imageUrls.length > 1));
  assert.ok(snapshot.records.every((record) => record.reviewStatus === "pending"));
});

test("repaired opening cards retain verified full photographs instead of cropped OG thumbnails", () => {
  const snapshot = createPublicSnapshot(bootstrap);
  for (const shortcode of ["DeTtk7ICe_v", "DeRIwoCjDOk", "DeTEajcCms0", "DeTY_f4F56A"]) {
    const record = snapshot.records.find((item) => item.id.endsWith(`:${shortcode}`));
    assert.ok(record?.imageUrls.length);
    assert.doesNotMatch(new URL(record.imageUrls[0]).searchParams.get("stp") ?? "", /(?:^|_)c\d+\./);
  }
  assert.equal(snapshot.records.find((item) => item.id.endsWith(":DeTtk7ICe_v")).imageUrls.length, 2);
});

test("GitHub publication creates an isolated root and refuses force updates", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ url, ...options, body });
    if (options.method === "GET") return new Response("", { status: 404 });
    return Response.json({ sha: `sha-${calls.length}` });
  };
  const store = createDataStore({ repository: "Team-Neki/Team-Neki-Admin", token: "test-not-a-token", fetchImpl });
  assert.deepEqual(await store.restore(), { sha: null, state: null });
  const snapshot = createPublicSnapshot(bootstrap);
  await store.publish({ sha: null, state: publicState(bootstrap), snapshot });
  const commit = calls.find((call) => call.url.endsWith("git/commits"));
  assert.deepEqual(commit.body.parents, []);
  const tree = calls.find((call) => call.url.endsWith("git/trees"));
  assert.deepEqual(tree.body.tree.map((item) => item.path), ["state.json", "brand-news.json"]);
  assert.equal(calls.at(-1).body.ref, "refs/heads/data/brand-news");
  await store.publish({ sha: "previous-sha", state: publicState(bootstrap), snapshot });
  assert.equal(calls.at(-1).body.force, false);
  assert.deepEqual(calls.filter((call) => call.url.endsWith("git/commits")).at(-1).body.parents, ["previous-sha"]);
});

test("corrupt saved data and concurrent reference updates are not silently overwritten", async () => {
  const corrupt = createDataStore({ repository: "a/b", token: "test", fetchImpl: async (url) => Response.json(url.includes("git/blobs/") ? { encoding: "base64", size: 10, content: Buffer.from("{}").toString("base64") } : url.includes("git/trees/") ? { tree: [{ path: "state.json", type: "blob", sha: "blob" }] } : url.includes("git/commits/") ? { tree: { sha: "tree" } } : { object: { sha: "first" } }) });
  await assert.rejects(corrupt.restore(), /Invalid saved collector state/);
  const race = createDataStore({ repository: "a/b", token: "test", fetchImpl: async (_, options) => options.method === "PATCH" ? new Response("", { status: 422 }) : Response.json({ sha: "new" }) });
  await assert.rejects(race.publish({ sha: "first", state: {}, snapshot: { generatedAt: "now" } }), /422/);
});
