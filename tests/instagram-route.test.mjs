import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { startTestServer, fetchWithTestSession as fetchAdmin } from "./server-test-helper.mjs";

const requests = [];
const accountId = "17841447544847066";
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const dayMs = 86_400_000;
const day = (ago) => new Date(Date.parse(`${today}T00:00:00+09:00`) - ago * dayMs).toISOString();
const date = (ago) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(day(ago)));
const range = `startDate=${date(6)}&endDate=${today}`;
const total = (name, value) => ({ name, total_value: { value } });
const servers = [];
let provider;
let environment;
let configured;
let cacheDirectory;
let addedPost = false;

test.before(async () => {
  cacheDirectory = await mkdtemp(join(tmpdir(), "neki-instagram-test-"));
  provider = createServer((request, response) => {
    const url = new URL(request.url, "http://provider.test");
    const token = request.headers.authorization?.slice(7);
    requests.push({ token, path: url.pathname, params: Object.fromEntries(url.searchParams), authorization: request.headers.authorization });
    response.setHeader("content-type", "application/json");
    const send = (data, status = 200) => { response.statusCode = status; response.end(JSON.stringify(data)); };
    if (token === "invalid-test-token") return send({ error: { code: 190, message: "secret invalid-test-token" } }, 400);
    if (token === "denied-test-token") return send({ error: { code: 10, message: "secret denied-test-token" } }, 403);
    if (url.pathname === `/v26.0/${accountId}`) return send({ id: "28848291921430622", user_id: token === "wrong-id-test-token" ? "123" : accountId, username: "neki_official_", followers_count: 321 });
    if (token === "limited-test-token") {
      response.setHeader("retry-after", "1000");
      return send({ error: { code: 4, message: "secret limited-test-token" } }, 429);
    }
    if (url.pathname === `/v26.0/${accountId}/stories`) return send({ data: token === "empty-stories-test-token" ? [] : [
      { id: "61", caption: "현재 스토리", media_type: "IMAGE", timestamp: new Date(Date.now() - 3600000).toISOString(), media_url: "https://scontent.cdninstagram.com/story.jpg" },
      { id: "62", caption: "조회 인원 부족", media_type: "VIDEO", timestamp: new Date(Date.now() - 7200000).toISOString() },
      { id: "63", caption: "만료 스토리", media_type: "IMAGE", timestamp: day(3) },
      { id: "64", caption: "미래 스토리", media_type: "IMAGE", timestamp: new Date(Date.now() + 3600000).toISOString() },
    ], paging: url.searchParams.has("after") ? {} : { cursors: { after: "stories_next" }, next: "https://graph.instagram.com/secret?access_token=NEVER_RETURN" } });
    if (url.pathname === "/v26.0/61/insights") return send({ data: [total("views", 20), total("reach", 10), total("replies", 0), total("shares", 1)] });
    if (url.pathname === "/v26.0/62/insights") return send({ error: { code: 10, message: "(#10) Not enough viewers for the media to show insights" } }, 400);
    if (/^\/v26\.0\/(71|72|73|74)$/.test(url.pathname)) return send({ id: url.pathname.split("/").at(-1), username: url.pathname.endsWith("72") ? "not_our_account" : "neki_official_", caption: "전체 캡션\n두 번째 줄", media_type: url.pathname.endsWith("74") ? "VIDEO" : "CAROUSEL_ALBUM", media_product_type: url.pathname.endsWith("73") ? "STORY" : "FEED", timestamp: day(2), like_count: 11, comments_count: 0, permalink: "https://www.instagram.com/p/detail/", media_url: "https://scontent.cdninstagram.com/parent.jpg" });
    if (url.pathname === "/v26.0/71/children") return send({ data: [
      { id: "711", media_type: "IMAGE", media_url: "https://scontent.cdninstagram.com/one.jpg" },
      { id: "712", media_type: "VIDEO", media_url: "https://video.cdninstagram.com/two.mp4", thumbnail_url: "https://scontent.cdninstagram.com/two.jpg" },
      { id: "713", media_type: "IMAGE", media_url: "https://evil.test/image.jpg?access_token=NEVER_RETURN" },
    ] });
    if (url.pathname === `/v26.0/${accountId}/insights`) {
      if (token === "partial-test-token" && url.searchParams.get("metric_type") === "total_value") return send({ error: { code: 100, message: "unsupported" } }, 400);
      return send({ data: url.searchParams.get("metric_type") === "time_series"
        ? [{ name: "reach", values: [{ value: 500, end_time: day(1) }, { value: 0, end_time: day(0) }] }]
        : [total("reach", 123), total("views", 404), total("likes", 5)] });
    }
    if (url.pathname === `/v26.0/${accountId}/media`) return send({ data: [
      ...(addedPost && token === "new-post-test-token" ? [{ id: "5", caption: "신규 게시물", media_type: "IMAGE", timestamp: day(0) }] : []),
      { id: url.searchParams.has("after") ? "4" : "1", caption: "실제 API fixture 게시물", media_type: "CAROUSEL_ALBUM", media_product_type: "FEED", timestamp: day(2), media_url: "https://scontent.cdninstagram.com/one.jpg", permalink: "https://www.instagram.com/p/fixture/" },
      { id: "2", caption: "릴스", media_type: "VIDEO", media_product_type: "REELS", timestamp: day(3), thumbnail_url: "https://scontent.cdninstagram.com/two.jpg" },
      { id: "3", caption: "미제공 지표", media_type: "IMAGE", media_product_type: "FEED", timestamp: day(4), media_url: "javascript:alert(1)" },
      { id: "99", caption: "기간 밖", media_type: "IMAGE", timestamp: day(40) },
    ], paging: url.searchParams.has("after") ? {} : { cursors: { after: "cursor_two" }, next: "https://graph.instagram.com/secret?access_token=NEVER_RETURN" } });
    if (/\/v26.0\/[124]\/insights/.test(url.pathname)) return send({ data: [
      { name: "views", values: [{ value: 700 }] }, { name: "reach", values: [{ value: 200 }] },
      { name: "comments", values: [{ value: 0 }] }, { name: "saved", values: [{ value: 11 }] },
      { name: "shares", values: [{ value: 3 }] }, { name: "profile_visits", values: [{ value: 7 }] },
    ] });
    return send({ data: [] });
  });
  await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve));
  environment = { INSTAGRAM_ACCOUNT_ID: accountId, INSTAGRAM_USERNAME: "neki_official_", INSTAGRAM_GRAPH_API_VERSION: "v26.0", INSTAGRAM_API_BASE_URL: `http://127.0.0.1:${provider.address().port}`, INSTAGRAM_ACCESS_TOKEN: "valid-test-token", INSTAGRAM_CACHE_DIR: cacheDirectory };
  configured = await startTestServer(environment);
  servers.push(configured);
});
test.after(async () => { await Promise.all(servers.map((server) => server.stop())); await new Promise((resolve) => provider.close(resolve)); await rm(cacheDirectory, { recursive: true, force: true }); });
async function variant(overrides) { const server = await startTestServer({ ...environment, ...overrides }); servers.push(server); return server; }

test("development JSON cache stays outside the source tree and generated data stays out of Docker builds", async () => {
  const source = await readFile(new URL("../app/api/instagram/instagram-file-cache.ts", import.meta.url), "utf8");
  assert.match(source, /return "\/tmp\/neki-admin-instagram"/);
  assert.doesNotMatch(source, /join\(process\.cwd\(\),/);
  const dockerignore = await readFile(new URL("../.dockerignore", import.meta.url), "utf8");
  assert.ok(dockerignore.split("\n").includes(".data"));
});

test("content detail is lazy, account-scoped, supports full carousel and video, and rejects unsafe URLs", async () => {
  const server = await variant({ INSTAGRAM_ACCESS_TOKEN: "content-test-token" });
  assert.equal((await fetch(`${server.baseUrl}/api/instagram/media/71`)).status, 401);
  const before = requests.length;
  assert.equal((await fetchAdmin(`${server.baseUrl}/api/instagram/media/invalid`)).status, 400);
  assert.equal(requests.length, before);
  const response = await fetchAdmin(`${server.baseUrl}/api/instagram/media/71`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const data = await response.json();
  assert.equal(data.assets.length, 3);
  assert.equal(data.assets[1].type, "video");
  assert.equal(data.assets[2].url, null);
  assert.equal(data.caption, "전체 캡션\n두 번째 줄");
  assert.equal(data.likes, 11);
  assert.equal(data.comments, 0);
  assert.ok(!JSON.stringify(data).includes("NEVER_RETURN"));
  const count = requests.length;
  await fetchAdmin(`${server.baseUrl}/api/instagram/media/71`);
  assert.equal(requests.length, count);
  assert.equal((await fetchAdmin(`${server.baseUrl}/api/instagram/media/72`)).status, 404);
  assert.equal((await fetchAdmin(`${server.baseUrl}/api/instagram/media/73`)).status, 404);
  const video = await (await fetchAdmin(`${server.baseUrl}/api/instagram/media/74`)).json();
  assert.equal(video.assets[0].type, "video");
});

test("stories are lazy, bounded to active 24 hours, with honest unavailable and empty states", async () => {
  const server = await variant({ INSTAGRAM_ACCESS_TOKEN: "stories-test-token" });
  assert.equal((await fetch(`${server.baseUrl}/api/instagram/stories`)).status, 401);
  const count = requests.length;
  assert.equal((await fetchAdmin(`${server.baseUrl}/api/instagram/stories?cursor=https://evil.test`)).status, 400);
  assert.equal(requests.length, count);
  const response = await fetchAdmin(`${server.baseUrl}/api/instagram/stories`);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(data.stories.map((story) => story.id), ["61", "62"]);
  assert.equal(data.stories[0].views, 20);
  assert.equal(data.stories[0].replies, 0);
  assert.equal(data.stories[1].reach, null);
  assert.ok(data.warnings[0].includes("조회 인원"));
  assert.equal(data.nextCursor, "stories_next");
  assert.ok(!JSON.stringify(data).includes("NEVER_RETURN"));
  const warm = requests.length;
  await fetchAdmin(`${server.baseUrl}/api/instagram/stories?refresh=1`);
  assert.equal(requests.length, warm);
  const next = await (await fetchAdmin(`${server.baseUrl}/api/instagram/stories?cursor=stories_next`)).json();
  assert.equal(next.nextCursor, null);
  const empty = await variant({ INSTAGRAM_ACCESS_TOKEN: "empty-stories-test-token" });
  const result = await (await fetchAdmin(`${empty.baseUrl}/api/instagram/stories`)).json();
  assert.deepEqual(result.stories, []);
  assert.deepEqual(result.warnings, []);
});

test("Instagram is authenticated, unconfigured is explicit, and invalid input never calls Meta", async () => {
  assert.equal((await fetch(`${configured.baseUrl}/api/instagram/metrics?${range}`)).status, 401);
  const unset = await variant({ INSTAGRAM_ACCESS_TOKEN: "" });
  const missing = await fetchAdmin(`${unset.baseUrl}/api/instagram/metrics`);
  assert.equal(missing.status, 503);
  assert.equal((await missing.json()).code, "instagram_not_configured");
  const count = requests.length;
  for (const query of ["endDate=invalid", "startDate=2026-02-30", "startDate=2020-01-01", "startDate=2099-01-01", `${range}&cursor=https://evil.test`]) {
    assert.equal((await fetchAdmin(`${configured.baseUrl}/api/instagram/metrics?${query}`)).status, 400);
  }
  assert.equal(requests.length, count);
});

test("returns account period totals, provider daily reach and media lifetime metrics without inventions", async () => {
  const response = await fetchAdmin(`${configured.baseUrl}/api/instagram/metrics?${range}`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const data = await response.json();
  assert.equal(data.followers, 321);
  assert.equal(data.reach, 123); // Not the sum of daily unique accounts.
  assert.equal(data.views, 404);
  assert.equal(data.likes, 5);
  assert.equal(data.trend[1].reach, 0);
  assert.equal(data.posts.length, 4);
  assert.ok(data.posts.some((post) => post.id === "99")); // All posts, independently of account metric dates.
  assert.equal(data.storage.readFrom, "meta");
  assert.ok(data.storage.savedAt);
  assert.equal(data.posts[0].profileVisits, 7);
  assert.equal(data.posts[1].profileVisits, null); // Unsupported on Reels.
  assert.equal(data.posts[2].views, null);
  assert.equal(data.posts[2].thumbnailUrl, null);
  assert.equal(data.posts[0].comments, 0);
  assert.equal(data.nextCursor, "cursor_two");
  assert.ok(!JSON.stringify(data).includes("NEVER_RETURN"));
  assert.ok(!JSON.stringify(data).includes("valid-test-token"));
  assert.ok(requests.every((request) => !Object.hasOwn(request.params, "access_token") && request.authorization?.startsWith("Bearer ")));
  const reel = requests.find((request) => request.path === "/v26.0/2/insights");
  assert.ok(!reel.params.metric.includes("profile_visits"));
  assert.equal(requests.filter((request) => request.path === "/v26.0/99/insights").length, 1);
});

test("same range refreshes and concurrent reads reuse caches; later pages reuse account requests", async () => {
  const first = await (await fetchAdmin(`${configured.baseUrl}/api/instagram/metrics?${range}`)).json();
  const count = requests.length;
  const responses = await Promise.all(Array.from({ length: 4 }, () => fetchAdmin(`${configured.baseUrl}/api/instagram/metrics?${range}`)));
  for (const response of responses) assert.equal((await response.json()).fetchedAt, first.fetchedAt);
  assert.equal(requests.length, count);
  const next = await fetchAdmin(`${configured.baseUrl}/api/instagram/metrics?${range}&cursor=cursor_two`);
  assert.equal((await next.json()).nextCursor, null);
  assert.equal(requests.length - count, 2); // Only next list page and its new media.
});

test("partial upstream failures remain missing, not fake or zero values", async () => {
  const server = await variant({ INSTAGRAM_ACCESS_TOKEN: "partial-test-token" });
  const response = await fetchAdmin(`${server.baseUrl}/api/instagram/metrics?${range}`);
  const data = await response.json();
  assert.equal(data.reach, null);
  assert.equal(data.views, null);
  assert.equal(data.followers, 321);
  assert.equal(data.posts.length, 4);
  assert.equal(data.storage.savedAt, null);
  assert.ok(data.warnings.includes("기간 합계를 가져오지 못했습니다."));
});

test("cold concurrent requests collapse each provider URL into one call", async () => {
  const server = await variant({ INSTAGRAM_ACCESS_TOKEN: "concurrent-test-token" });
  const before = requests.length;
  const responses = await Promise.all(Array.from({ length: 4 }, () => fetchAdmin(`${server.baseUrl}/api/instagram/metrics?${range}`)));
  assert.ok(responses.every((response) => response.status === 200));
  const actual = requests.slice(before).filter((request) => request.token === "concurrent-test-token");
  assert.equal(actual.length, 8);
  assert.equal(actual.filter((request) => request.path === `/v26.0/${accountId}`).length, 1);
});

async function storedFiles(directory) {
  return Promise.all((await readdir(join(directory, "snapshots"))).filter((name) => name.endsWith(".json")).map(async (name) => {
    const path = join(directory, "snapshots", name);
    return { path, stored: JSON.parse(await readFile(path, "utf8")) };
  }));
}

test("saved JSON survives a process restart without another Meta request and excludes credentials", async () => {
  const response = await fetchAdmin(`${configured.baseUrl}/api/instagram/metrics?${range}`);
  const first = await response.json();
  const files = await storedFiles(cacheDirectory);
  const saved = files.find(({ stored }) => stored.value.fetchedAt === first.fetchedAt && stored.value.startDate === date(6));
  assert.ok(saved);
  assert.equal((await stat(saved.path)).mode & 0o777, 0o600);
  const text = await readFile(saved.path, "utf8");
  assert.ok(!text.includes("valid-test-token") && !text.includes("NEVER_RETURN") && !text.includes("access_token"));
  const restarted = await variant({});
  const count = requests.length;
  const result = await (await fetchAdmin(`${restarted.baseUrl}/api/instagram/metrics?${range}`)).json();
  assert.equal(result.storage.readFrom, "file");
  assert.equal(result.fetchedAt, first.fetchedAt);
  assert.equal(result.followers, first.followers);
  assert.equal(requests.length, count);
});

test("manual refresh detects new posts after cooldown and immediate repeats use the saved snapshot", async () => {
  const directory = await mkdtemp(join(cacheDirectory, "new-post-"));
  const config = { INSTAGRAM_ACCESS_TOKEN: "new-post-test-token", INSTAGRAM_CACHE_DIR: directory };
  const firstServer = await variant(config);
  const initial = await (await fetchAdmin(`${firstServer.baseUrl}/api/instagram/metrics?${range}`)).json();
  assert.equal(initial.posts.length, 4);
  addedPost = true;
  const before = requests.length;
  const tooSoon = await (await fetchAdmin(`${firstServer.baseUrl}/api/instagram/metrics?${range}&refresh=1`)).json();
  assert.equal(tooSoon.posts.length, 4);
  assert.equal(tooSoon.storage.readFrom, "file");
  assert.equal(requests.length, before);
  // Age only this test-owned snapshot; no production clock or auth bypass exists.
  const [{ path, stored }] = await storedFiles(directory);
  stored.value.fetchedAt = new Date(Date.now() - 61_000).toISOString();
  await writeFile(path, JSON.stringify(stored));
  const restarted = await variant(config);
  const updated = await (await fetchAdmin(`${restarted.baseUrl}/api/instagram/metrics?${range}&refresh=1`)).json();
  assert.equal(updated.posts.length, 5);
  assert.ok(updated.posts.some((post) => post.id === "5"));
  assert.equal(updated.storage.readFrom, "meta");
  const after = requests.length;
  await fetchAdmin(`${restarted.baseUrl}/api/instagram/metrics?${range}&refresh=1`);
  assert.equal(requests.length, after);
});

test("invalid or expired files are re-collected, and storage failure is visible rather than silently ignored", async () => {
  const directory = await mkdtemp(join(cacheDirectory, "invalid-"));
  const config = { INSTAGRAM_ACCESS_TOKEN: "disk-validation-test-token", INSTAGRAM_CACHE_DIR: directory };
  const initialServer = await variant(config);
  await fetchAdmin(`${initialServer.baseUrl}/api/instagram/metrics?${range}`);
  const [{ path, stored }] = await storedFiles(directory);
  for (const invalid of [{ ...stored, expiresAt: 0 }, { ...stored, value: { ...stored.value, unexpectedSecret: "never-expose" } }, { ...stored, value: { ...stored.value, posts: [{ ...stored.value.posts[0], thumbnailUrl: "https://evil.example/a.jpg" }] } }]) {
    await writeFile(path, JSON.stringify(invalid));
    const restarted = await variant(config);
    const count = requests.length;
    const result = await (await fetchAdmin(`${restarted.baseUrl}/api/instagram/metrics?${range}`)).json();
    assert.equal(result.storage.readFrom, "meta");
    assert.ok(requests.length > count);
    assert.ok(!JSON.stringify(result).includes("never-expose"));
  }
  const blocked = join(directory, "not-a-directory");
  await writeFile(blocked, "fixture");
  const unavailable = await variant({ ...config, INSTAGRAM_CACHE_DIR: blocked });
  const result = await (await fetchAdmin(`${unavailable.baseUrl}/api/instagram/metrics?${range}`)).json();
  assert.equal(result.storage.savedAt, null);
  assert.ok(result.warnings.includes("지표를 저장하지 못했습니다."));
});

test("token, permission and account mismatch errors are sanitized, not admin-session 401/403", async () => {
  for (const [token, code] of [["invalid-test-token", "instagram_token_invalid"], ["denied-test-token", "instagram_permission_denied"]]) {
    const server = await variant({ INSTAGRAM_ACCESS_TOKEN: token });
    const response = await fetchAdmin(`${server.baseUrl}/api/instagram/metrics?${range}`);
    const body = await response.text();
    assert.equal(response.status, 502);
    assert.equal(JSON.parse(body).code, code);
    assert.ok(!body.includes(token));
  }
  const wrong = await variant({ INSTAGRAM_USERNAME: "other_account" });
  const response = await fetchAdmin(`${wrong.baseUrl}/api/instagram/metrics?${range}`);
  assert.equal((await response.json()).code, "instagram_account_mismatch");
  const wrongId = await variant({ INSTAGRAM_ACCESS_TOKEN: "wrong-id-test-token" });
  const mismatched = await fetchAdmin(`${wrongId.baseUrl}/api/instagram/metrics?${range}`);
  assert.equal((await mismatched.json()).code, "instagram_account_mismatch");
});

test("Meta 429 creates a shared cooldown across date ranges without retry fan-out", async () => {
  const server = await variant({ INSTAGRAM_ACCESS_TOKEN: "limited-test-token" });
  const response = await fetchAdmin(`${server.baseUrl}/api/instagram/metrics?${range}`);
  assert.equal(response.status, 429);
  assert.ok(Number(response.headers.get("retry-after")) >= 900);
  const count = requests.length;
  const second = await fetchAdmin(`${server.baseUrl}/api/instagram/metrics?startDate=${date(5)}&endDate=${today}`);
  assert.equal(second.status, 429);
  assert.equal(requests.length, count);
});
