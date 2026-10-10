import test from "node:test";
import assert from "node:assert/strict";
import { fetchPublicInstagramHtml } from "../src/instagram-browser.mjs";
import { collectCandidates } from "../src/collect.mjs";
import { applyCollectionOutcome, sourceHasFailure } from "../src/collection-policy.mjs";
import { selectedPages } from "../src/collection-scope.mjs";
import { parseInstagramSnapshot } from "../src/parse.mjs";
import { mergeCandidates } from "../src/merge.mjs";

const source = selectedPages.find((page) => page.account === "life4cuts_official");
const posts = ["FIRST123", "SECOND123", "THIRD123", "FOURTH123"].map((id) => `${source.url}p/${id}/`);

function browserScenario(outcomes = []) {
  const navigations = [];
  let closed = false;
  let url = source.url;
  let outcome;
  const listeners = new Set();
  const tab = {
    on(event, listener) { if (event === "response") listeners.add(listener); },
    off(event, listener) { if (event === "response") listeners.delete(listener); },
    async goto(next) {
      navigations.push(next);
      outcome = outcomes[navigations.length - 1] ?? {};
      url = outcome.redirect ?? next;
      if (outcome.xhrStatus) for (const listener of listeners) listener({ url: () => outcome.xhrUrl ?? "https://www.instagram.com/graphql/query", status: () => outcome.xhrStatus,
        headers: () => ({ "retry-after": "3600" }), request: () => ({ resourceType: () => "fetch" }) });
      return { status: () => outcome.status ?? 200, allHeaders: async () => outcome.headers ?? {} };
    },
    url: () => url,
    async waitForSelector() { if (outcome.missingSelector) throw new Error("selector timeout"); },
    locator: () => ({ evaluateAll: async () => posts }),
    async evaluate() { return { url, description: outcome.badMetadata ? "Instagram login" : 'life4cuts_official - October 10, 2026: "콜라보 프레임 공개".', image: "https://cdn.example.com/frame.jpg" }; },
  };
  return {
    navigations, get closed() { return closed; },
    options: { limit: 4, wait: async () => {}, snapshotDirectory: null, launchBrowser: async () => ({
      newContext: async () => ({ route: async () => {}, newPage: async () => tab }),
      close: async () => { closed = true; },
    }) },
  };
}

test("Instagram 429 stops the source immediately and propagates Retry-After", async () => {
  const scenario = browserScenario([{}, { status: 429, headers: { "retry-after": "86400" } }]);
  await assert.rejects(fetchPublicInstagramHtml(source, scenario.options), (error) => error.code === "rate-limited" && error.retryAfterMs === 86_400_000);
  assert.equal(scenario.navigations.length, 2);
  assert.equal(scenario.closed, true);
});

test("a first-party internal 429 stops a 200 document before the next post", async () => {
  const scenario = browserScenario([{}, {}, { xhrStatus: 429 }]);
  const html = await fetchPublicInstagramHtml(source, scenario.options);
  const result = await collectCandidates({ pages: [source], browserFetchImpl: async () => html });
  assert.equal(scenario.navigations.length, 3);
  assert.equal(result.diagnostics[0].failureCode, "rate-limited");
  assert.equal(result.diagnostics[0].retryAfterMs, 3_600_000);
  assert.equal(result.diagnostics[0].failedPosts[0].url, posts[1]);
  assert.equal(result.diagnostics[0].failedPosts[0].stage, "navigate");
});

test("third-party 429 is ignored and profile 429 preserves no false success", async () => {
  const ignored = browserScenario([{ xhrStatus: 429, xhrUrl: "https://telemetry.example.com" }]);
  assert.equal(parseInstagramSnapshot(await fetchPublicInstagramHtml(source, ignored.options), source).length, 4);
  const blocked = browserScenario([{ xhrStatus: 429 }]);
  await assert.rejects(fetchPublicInstagramHtml(source, blocked.options), { code: "rate-limited" });
  assert.equal(blocked.navigations.length, 1);
  assert.equal(blocked.closed, true);
});

test("incremental scan skips fresh posts, prioritizes new IDs and bounds retry attempts", async () => {
  const observedAt = "2026-10-10T12:00:00Z";
  const knownRecords = posts.slice(0, 3).map((sourceUrl) => ({ sourceUrl, observedAt }));
  const fresh = browserScenario();
  const html = await fetchPublicInstagramHtml(source, { ...fresh.options, observedAt, knownRecords });
  assert.deepEqual(fresh.navigations, [source.url, posts[3]]);
  assert.equal(parseInstagramSnapshot(html, source).length, 1);
  const failed = browserScenario([{}, { badMetadata: true }]);
  await assert.rejects(fetchPublicInstagramHtml(source, { ...failed.options, observedAt, knownRecords,
    failedPosts: [{ url: posts[3], attempts: 2, status: "retry-pending", nextAttemptAt: "2026-10-10T10:00:00Z" }] }), (error) => {
    assert.equal(error.failedPosts[0].status, "needs-review");
    assert.equal(error.failedPosts[0].attempts, 3);
    return true;
  });
  const skip = browserScenario();
  const noDetails = await fetchPublicInstagramHtml(source, { ...skip.options, observedAt, knownRecords,
    failedPosts: [{ url: posts[3], attempts: 3, status: "needs-review", nextAttemptAt: null }] });
  const result = await collectCandidates({ pages: [source], browserFetchImpl: async () => noDetails });
  assert.deepEqual(skip.navigations, [source.url]);
  assert.equal(result.diagnostics[0].status, "partial");
});

test("login during a batch retains readable posts but reports partial failure", async () => {
  const scenario = browserScenario([{}, {}, { redirect: "https://www.instagram.com/accounts/login/" }]);
  const html = await fetchPublicInstagramHtml(source, scenario.options);
  assert.equal(scenario.navigations.length, 3);
  assert.equal(scenario.closed, true);
  const result = await collectCandidates({ pages: [source], browserFetchImpl: async () => html });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.diagnostics[0].status, "partial");
  assert.equal(result.diagnostics[0].failureCode, "login-required");
  assert.equal(result.diagnostics[0].selectedCount, 4);
  assert.equal(result.diagnostics[0].attemptedDetails, 2);
  assert.equal(result.diagnostics[0].detailFailures, 1);
  assert.equal(result.diagnostics[0].lastSuccessAt, undefined);
});

test("repeated missing metadata stops after three details instead of exhausting the profile", async () => {
  const scenario = browserScenario([{}, { badMetadata: true }, { badMetadata: true }, { badMetadata: true }]);
  await assert.rejects(fetchPublicInstagramHtml(source, scenario.options), (error) => error.code === "layout-changed");
  assert.equal(scenario.navigations.length, 4);
  assert.equal(scenario.closed, true);
});

test("profile access denial and missing public list are classified", async () => {
  for (const [outcome, code] of [[{ status: 403 }, "access-denied"], [{ missingSelector: true }, "layout-changed"], [{ redirect: "https://www.instagram.com/challenge/" }, "challenge-required"]]) {
    const scenario = browserScenario([outcome]);
    await assert.rejects(fetchPublicInstagramHtml(source, scenario.options), (error) => error.code === code);
    assert.equal(scenario.navigations.length, 1);
    assert.equal(scenario.closed, true);
  }
});

test("the source time budget prevents further detail navigation", async () => {
  const scenario = browserScenario();
  let clock = 0;
  await assert.rejects(fetchPublicInstagramHtml(source, { ...scenario.options, maxDurationMs: 1000, now: () => clock, wait: async (ms) => { clock += ms; } }), (error) => error.code === "deadline-exceeded");
  assert.equal(scenario.navigations.length, 1);
  assert.equal(scenario.closed, true);
});

test("persistent failure streak increases cooldown and success resets it", () => {
  const diagnostic = { sourceKey: source.key, status: "error", failureCode: "rate-limited" };
  const first = applyCollectionOutcome(diagnostic, null, "2026-10-10T00:00:00Z");
  assert.equal(first.nextAttemptAt, "2026-10-10T06:00:00.000Z");
  const second = applyCollectionOutcome(diagnostic, first, "2026-10-10T06:00:00Z");
  assert.equal(second.nextAttemptAt, "2026-10-10T18:00:00.000Z");
  const third = applyCollectionOutcome(diagnostic, second, "2026-10-10T18:00:00Z");
  assert.equal(third.nextAttemptAt, "2026-10-11T18:00:00.000Z");
  const recovered = applyCollectionOutcome({ sourceKey: source.key, status: "ok", lastSuccessAt: "2026-10-11T18:00:00Z" }, third, "2026-10-11T18:00:00Z");
  assert.equal(recovered.consecutiveFailures, 0);
  assert.equal(recovered.nextAttemptAt, null);
  assert.equal(sourceHasFailure({ status: "ok", detailFailures: 3 }), true);
  const partial = applyCollectionOutcome({ sourceKey: source.key, status: "partial" }, recovered, "2026-10-12T00:00:00Z");
  assert.equal(partial.lastSuccessAt, recovered.lastSuccessAt);
  assert.equal(partial.lastPartialAt, "2026-10-12T00:00:00Z");
});

test("legacy counted failures are rechecked instead of promoted from cache to success", async () => {
  const scenario = browserScenario();
  const result = await collectCandidates({ pages: [source], observedAt: "2026-10-10T12:00:00Z", previous: {
    records: posts.map((sourceUrl) => ({ sourceKey: source.key, sourceUrl, observedAt: "2026-10-10T11:00:00Z" })),
    diagnostics: [{ sourceKey: source.key, status: "partial", detailFailures: 1 }],
  }, browserFetchImpl: async (page, options) => {
    assert.equal(options.knownRecords.length, 0);
    return fetchPublicInstagramHtml(page, { ...scenario.options, ...options });
  } });
  assert.equal(scenario.navigations.length, 5);
  assert.equal(result.diagnostics[0].status, "ok");
});

test("refreshing an Instagram image signature updates its URL without reopening review", () => {
  const snapshot = (image) => `<main data-source-account="life4cuts_official"><article data-post-url="${posts[0]}" data-description='life4cuts_official - October 10, 2026: "프레임 공개".' data-image="${image}"></article></main>`;
  const [first] = parseInstagramSnapshot(snapshot("https://scontent.cdninstagram.com/frame.jpg?oh=old&amp;oe=123"), source);
  const previous = mergeCandidates(null, { observedAt: "2026-10-10T00:00:00Z", candidates: [first], diagnostics: [] }).state;
  previous.records[0].reviewStatus = "approved";
  const [refreshed] = parseInstagramSnapshot(snapshot("https://scontent.cdninstagram.com/frame.jpg?oh=new&amp;oe=456"), source);
  const merged = mergeCandidates(previous, { observedAt: "2026-10-11T00:00:00Z", candidates: [refreshed], diagnostics: [] });
  assert.equal(merged.changed, 0);
  assert.equal(merged.state.records[0].reviewStatus, "approved");
  assert.match(merged.state.records[0].imageUrl, /oh=new/);
  const legacy = structuredClone(previous);
  delete legacy.records[0].fingerprintVersion;
  legacy.records[0].fingerprint = "old-hash-including-signature";
  const migrated = mergeCandidates(legacy, { observedAt: "2026-10-11T00:00:00Z", candidates: [refreshed], diagnostics: [] });
  assert.equal(migrated.changed, 0);
  assert.equal(migrated.state.records[0].reviewStatus, "approved");
  assert.equal(migrated.state.records[0].fingerprintVersion, 2);
  const [different] = parseInstagramSnapshot(snapshot("https://scontent.cdninstagram.com/new-frame.jpg?oh=new"), source);
  assert.equal(mergeCandidates(merged.state, { observedAt: "2026-10-12T00:00:00Z", candidates: [different], diagnostics: [] }).changed, 1);
});
