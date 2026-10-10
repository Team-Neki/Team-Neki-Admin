import test from "node:test";
import assert from "node:assert/strict";
import { brandSources, collectionPages } from "../src/sources.mjs";
import { parseHaruFilm, parseHaruNews, parseNaverRss, parsePhotoSignature, parsePhotomatic } from "../src/parse.mjs";
import { collectCandidates, fetchHtmlWithRetry } from "../src/collect.mjs";
import { mergeCandidates } from "../src/merge.mjs";
import { runCollection } from "../src/runner.mjs";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("source registry covers every current brand exactly once", () => {
  assert.equal(brandSources.length, 17);
  assert.equal(new Set(brandSources.map((item) => item.brandId)).size, 17);
  assert.ok(collectionPages.every((page) => brandSources.some((brand) => brand.brandId === page.brandId && brand.status === "enabled")));
});

test("photo signature dates are normalized only with a source year", () => {
  const page = collectionPages.find((item) => item.parser === "photosignature");
  const html = `<div id="bo_gall"><ul class="listBox"><li><a href="/bbs/board.php?bo_table=frame&wr_id=567"><div class="imgBox"><img src="https://photosignature.co.kr/frame.jpg"></div><div class="txtBox"><h3>[9월] 태비</h3><div class="bo_info"><span>09.09~10.31</span></div><!--<div class="bo_info"><span>2026-09-21</span></div>--></div></a></li></ul></div>`;
  const [item] = parsePhotoSignature(html, page);
  assert.equal(item.id, "brand-05:photosignature-frames:567");
  assert.equal(item.externalId, "567");
  assert.equal(item.startsOn, "2026-09-09");
  assert.equal(item.endsOn, "2026-10-31");
  assert.equal(item.availability, "unverified");
  assert.deepEqual(item.needsReview, []);

  const withoutYear = html.replace("2026-09-21", "");
  const [uncertain] = parsePhotoSignature(withoutYear, page);
  assert.equal(uncertain.startsOn, null);
  assert.ok(uncertain.needsReview.includes("start-date-unverified"));
});

test("haru film post ids deduplicate repeated links and keep dates unknown", () => {
  const page = { key: "harufilm-artists", brandId: "brand-04", kind: "collaboration", url: "https://harufilm.com/58/" };
  const html = `<a href="/58/?bmode=view&idx=174308324&q=abc"><div class="card_wrapper" style="background-image: url('https://cdn.imweb.me/sample.jpg')"></div>공지 [콜라보] JUNHEE X 하루필름</a><a href="/58/?bmode=view&idx=174308324&t=board">공지 [콜라보] JUNHEE X 하루필름</a>`;
  const items = parseHaruFilm(html, page);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "[콜라보] JUNHEE X 하루필름");
  assert.equal(items[0].startsOn, null);
  assert.equal(items[0].imageUrl, "https://cdn.imweb.me/sample.jpg");
  assert.ok(items[0].needsReview.includes("image-only-details"));
  assert.equal(items[0].sourceUrl, "https://harufilm.com/58/?bmode=view&idx=174308324");
});

test("photomatic excludes general notices and marks dates for review", () => {
  const page = collectionPages.find((item) => item.parser === "photomatic");
  const html = `<div class="acd_row"><div class="acd_heading" id="collapse_header_123"><div class="category">BOOTH</div><div class="title">2026 Ongoing Frame!</div></div><div class="board_contents"><img src="https://cdn.imweb.me/frame.jpg"></div></div><div class="acd_row"><div class="acd_heading" id="collapse_header_124"><div class="category">NOTICE</div><div class="title">운영 시간</div></div></div>`;
  const items = parsePhotomatic(html, page);
  assert.equal(items.length, 1);
  assert.equal(items[0].kind, "frame");
  assert.equal(items[0].startsOn, null);
  assert.equal(items[0].sourceStatus, "unknown");
});

test("an explicit ended title is retained as source evidence without claiming availability", () => {
  const page = collectionPages.find((item) => item.parser === "photomatic");
  const html = `<div class="acd_row"><div class="acd_heading" id="collapse_header_126"><div class="category">BOOTH</div><div class="title">프레임 안내 - 종료!</div></div></div>`;
  const [item] = parsePhotomatic(html, page);
  assert.equal(item.sourceStatus, "ended");
  assert.equal(item.availability, "unverified");
});

test("explicit years are parsed without a publication date", () => {
  const page = collectionPages.find((item) => item.parser === "photomatic");
  const html = `<div class="acd_row"><div class="acd_heading" id="collapse_header_125"><div class="category">EVENT</div><div class="title">콜라보 이벤트</div></div><div class="board_contents">2026.09.01 ~ 2026.10.31</div></div>`;
  const [item] = parsePhotomatic(html, page);
  assert.equal(item.startsOn, "2026-09-01");
  assert.equal(item.endsOn, "2026-10-31");
});

test("a changed or empty source is reported as a failure, not as zero new frames", async () => {
  const page = collectionPages[0];
  const fetchImpl = async () => new Response("<html></html>", { headers: { "content-type": "text/html" } });
  const result = await collectCandidates({ pages: [page], fetchImpl, observedAt: "2026-09-25T00:00:00.000Z" });
  assert.deepEqual(result.candidates, []);
  assert.equal(result.diagnostics[0].status, "error");
});

test("transient source failures retry but invalid responses do not", async () => {
  let attempts = 0;
  const fetchImpl = async () => {
    attempts += 1;
    return new Response(attempts === 1 ? "retry" : "<html>ok</html>", {
      status: attempts === 1 ? 503 : 200,
      headers: { "content-type": "text/html" },
    });
  };
  let waits = 0;
  assert.equal(await fetchHtmlWithRetry("https://example.com", fetchImpl, async () => { waits += 1; }), "<html>ok</html>");
  assert.equal(attempts, 2);
  assert.equal(waits, 1);

  attempts = 0;
  await assert.rejects(fetchHtmlWithRetry("https://example.com", async () => {
    attempts += 1;
    return new Response("missing", { status: 404, headers: { "content-type": "text/html" } });
  }, async () => { waits += 1; }), /HTTP 404/);
  assert.equal(attempts, 1);
  assert.equal(waits, 1);
});

test("incremental merge retains history and reopens changed records", () => {
  const base = { id: "brand-05:source:1", fingerprint: "first", title: "A" };
  const first = mergeCandidates(null, { observedAt: "2026-09-25T00:00:00Z", candidates: [base], diagnostics: [] });
  assert.equal(first.inserted, 1);
  first.state.records[0].reviewStatus = "approved";
  const unchanged = mergeCandidates(first.state, { observedAt: "2026-09-26T00:00:00Z", candidates: [base], diagnostics: [] });
  assert.equal(unchanged.state.records[0].reviewStatus, "approved");
  const edited = mergeCandidates(unchanged.state, { observedAt: "2026-09-27T00:00:00Z", candidates: [{ ...base, fingerprint: "second" }], diagnostics: [] });
  assert.equal(edited.changed, 1);
  assert.equal(edited.state.records[0].reviewStatus, "pending");
  const missing = mergeCandidates(edited.state, { observedAt: "2026-09-28T00:00:00Z", candidates: [], diagnostics: [] });
  assert.equal(missing.state.records.length, 1);
});

const haruHtml = (title = "몬치치 콜라보 프레임 출시") => `<div class="card" onclick="location.href='/301/?bmode=view&amp;idx=123&amp;q=tracking'"><div class="title"><em>공지</em>${title}</div><small class="date">2026-09-18</small><img data-original="https://cdn.imweb.me/sample.jpg"><div class="text-block">공지 요약</div></div>`;
const haruPage = collectionPages.find((page) => page.parser === "harufilm-news");
const picdotPage = collectionPages.find((page) => page.parser === "naver-rss");
const response = (body, status = 200, headers = {}) => new Response(body, { status, headers: { "content-type": "text/html", ...headers } });

test("haru news parses literal post links and dates without executing scripts", () => {
  const [item] = parseHaruNews(haruHtml(), haruPage);
  assert.equal(item.title, "몬치치 콜라보 프레임 출시");
  assert.equal(item.kind, "collaboration");
  assert.equal(item.publishedOn, "2026-09-18");
  assert.equal(item.sourceUrl, "https://harufilm.com/301/?bmode=view&idx=123");
  assert.equal(item.excerpt, "공지 요약");
  assert.equal(item.startsOn, null);
  assert.equal(parseHaruNews(haruHtml().replace("2026-09-18", "2026-02-30"), haruPage)[0].publishedOn, null);
});

test("rss preserves all news but only accepts the verified blog account", () => {
  const item = (account, id, title, date) => `<item><title><![CDATA[${title}]]></title><link>https://blog.naver.com/${account}/${id}?fromRss=true</link><pubDate>${date}</pubDate><description><![CDATA[글 요약 <img src="https://blogthumb.pstatic.net/frame.jpg">]]></description></item>`;
  const xml = `<rss><channel>${item("picdot_official", 123, "신규 프레임", "Mon, 31 Aug 2026 18:54:35 +0900")}${item("other", 456, "다른 계정", "invalid")}${item("picdot_official", 124, "매장 소식", "invalid")}</channel></rss>`;
  const items = parseNaverRss(xml, picdotPage);
  assert.equal(items.length, 2);
  assert.equal(items[0].kind, "frame");
  assert.equal(items[0].publishedOn, "2026-08-31");
  assert.equal(items[0].sourceUrl, "https://blog.naver.com/picdot_official/123");
  assert.equal(items[0].excerpt, "글 요약");
  assert.equal(items[1].publishedOn, null);
  assert.equal(items[1].kind, "news");
});

test("RSS is accepted, oversized payloads and non-HTTPS sources are rejected", async () => {
  assert.equal(await fetchHtmlWithRetry(picdotPage.url, async () => response("<rss/>", 200, { "content-type": "text/xml;charset=UTF-8" })), "<rss/>");
  await assert.rejects(fetchHtmlWithRetry(haruPage.url, async () => response("x".repeat(2_000_001))), /size limit/);
  await assert.rejects(fetchHtmlWithRetry("http://example.com", async () => response("html")), /HTTPS/);
});

test("long Retry-After avoids retry bursts", async () => {
  let calls = 0;
  await assert.rejects(fetchHtmlWithRetry(haruPage.url, async () => { calls += 1; return response("rate limited", 429, { "retry-after": "3600" }); }, async () => assert.fail("must not wait/retry")), /HTTP 429/);
  assert.equal(calls, 1);
});

test("short Retry-After also stops HTTP 429 without immediate retries", async () => {
  let calls = 0;
  await assert.rejects(fetchHtmlWithRetry(haruPage.url, async () => {
    calls += 1;
    return response("rate limited", 429, { "retry-after": "1" });
  }, async () => assert.fail("429 must defer to the persistent cooldown")), /HTTP 429/);
  assert.equal(calls, 1);
});

async function workspace(t) {
  const path = await mkdtemp(join(tmpdir(), "neki-news-test-"));
  t.after(() => rm(path, { recursive: true, force: true }));
  return { stateFile: join(path, "state.json"), outputFile: join(path, "latest.json") };
}

test("standalone runner saves, caches without requests, and detects changes", async (t) => {
  const files = await workspace(t);
  const first = await runCollection({ ...files, pages: [haruPage], fetchImpl: async () => response(haruHtml()), observedAt: "2026-09-26T00:00:00Z" });
  assert.equal(first.inserted, 1);
  const cached = await runCollection({ ...files, pages: [haruPage], fetchImpl: async () => assert.fail("cache must avoid network"), observedAt: "2026-09-26T00:01:00Z" });
  assert.equal(cached.requestedSources, 0);
  assert.equal(cached.cachedSources, 1);
  assert.equal(cached.changed, 0);
  assert.equal(cached.state.records[0].lastSeenAt, first.state.records[0].lastSeenAt);
  const changed = await runCollection({ ...files, pages: [haruPage], force: true, fetchImpl: async () => response(haruHtml("변경 프레임")), observedAt: "2026-09-26T00:02:00Z" });
  assert.equal(changed.changed, 1);
  assert.equal(JSON.parse(await readFile(files.stateFile, "utf8")).records[0].title, "변경 프레임");
  const expired = await runCollection({ ...files, pages: [haruPage], fetchImpl: async () => response(haruHtml("변경 프레임")), observedAt: "2026-09-27T00:02:00Z" });
  assert.equal(expired.requestedSources, 1);
  assert.equal(expired.inserted, 0);
  assert.equal(expired.changed, 0);
});

test("failed sources retain records and persist retry cooldown, even with force", async (t) => {
  const files = await workspace(t);
  await runCollection({ ...files, pages: [haruPage], fetchImpl: async () => response(haruHtml()), observedAt: "2026-09-26T00:00:00Z" });
  const failed = await runCollection({ ...files, pages: [haruPage], force: true, fetchImpl: async () => response("rate limited", 429, { "retry-after": "3600" }), observedAt: "2026-09-26T00:01:00Z" });
  assert.equal(failed.failures, 1);
  assert.equal(failed.state.records.length, 1);
  assert.equal(failed.state.diagnostics[0].lastSuccessAt, "2026-09-26T00:00:00Z");
  const deferred = await runCollection({ ...files, pages: [haruPage], force: true, fetchImpl: async () => assert.fail("Retry-After cooldown must hold"), observedAt: "2026-09-26T00:02:00Z" });
  assert.equal(deferred.requestedSources, 0);
  assert.equal(deferred.snapshot.diagnostics[0].status, "deferred");
  assert.equal(deferred.failures, 1);
  assert.equal(failed.state.diagnostics[0].nextAttemptAt, "2026-09-26T06:01:00.000Z");
  const recovered = await runCollection({ ...files, pages: [haruPage], fetchImpl: async () => response(haruHtml()), observedAt: "2026-09-26T06:02:00Z" });
  assert.equal(recovered.requestedSources, 1);
  assert.equal(recovered.failures, 0);
});

test("corrupt state and simultaneous runs are not overwritten", async (t) => {
  const files = await workspace(t);
  await writeFile(files.stateFile, "invalid-json");
  await assert.rejects(runCollection({ ...files, fetchImpl: async () => assert.fail("no network") }));
  assert.equal(await readFile(files.stateFile, "utf8"), "invalid-json");
  await writeFile(`${files.stateFile}.lock`, "active");
  await assert.rejects(runCollection(files), /locked/);
  await assert.rejects(runCollection({ ...files, outputFile: files.stateFile }), /paths must differ/);
});

test("partial source failures do not discard other successful updates", async (t) => {
  const files = await workspace(t);
  const xml = `<rss><channel><item><title>신규 프레임</title><link>https://blog.naver.com/picdot_official/123</link><pubDate>Mon, 31 Aug 2026 18:54:35 +0900</pubDate></item></channel></rss>`;
  await runCollection({ ...files, pages: [haruPage], fetchImpl: async () => response(haruHtml()), observedAt: "2026-09-26T00:00:00Z" });
  const result = await runCollection({ ...files, pages: [haruPage, picdotPage], force: true,
    fetchImpl: async (url) => url === haruPage.url ? response("not found", 404) : response(xml, 200, { "content-type": "application/rss+xml" }),
    observedAt: "2026-09-26T00:01:00Z" });
  assert.equal(result.failures, 1);
  assert.equal(result.inserted, 1);
  assert.equal(result.state.records.length, 2);
  assert.equal(result.state.records.find((item) => item.sourceKey === haruPage.key).title, "몬치치 콜라보 프레임 출시");
  assert.equal(JSON.parse(await readFile(files.stateFile, "utf8")).records.length, 2);
});

test("partial Instagram batch persists new data, old records and cooldown across runs", async (t) => {
  const files = await workspace(t);
  const page = collectionPages.find((item) => item.key === "lifefourcuts-instagram");
  const article = (id) => `<article data-post-url="https://www.instagram.com/${page.account}/p/${id}/" data-description="${page.account} - October 10, 2026: &quot;신규 프레임 ${id}&quot;" data-image="https://scontent.cdninstagram.com/${id}.jpg"></article>`;
  const html = (attributes, ids) => `<main data-source-account="${page.account}" ${attributes}>${ids.map(article).join("")}</main>`;
  const first = await runCollection({ ...files, pages: [page], observedAt: "2026-10-10T00:00:00Z",
    fetchImpl: async () => response(html('data-read="2" data-selected="2"', ["one", "two"])) });
  assert.equal(first.failures, 0);
  const partial = await runCollection({ ...files, pages: [page], force: true, observedAt: "2026-10-10T00:01:00Z",
    fetchImpl: async () => response(html('data-read="1" data-selected="3" data-failed="1" data-failure-code="login-required"', ["three"])) });
  assert.equal(partial.failures, 1);
  assert.equal(partial.state.records.length, 3);
  assert.equal(partial.state.diagnostics[0].status, "partial");
  assert.equal(partial.state.diagnostics[0].lastSuccessAt, "2026-10-10T00:00:00Z");
  assert.equal(partial.state.diagnostics[0].nextAttemptAt, "2026-10-10T12:01:00.000Z");
  const deferred = await runCollection({ ...files, pages: [page], force: true, observedAt: "2026-10-10T00:02:00Z",
    fetchImpl: async () => assert.fail("partial source cooldown survives process state reload") });
  assert.equal(deferred.requestedSources, 0);
  assert.equal(deferred.failures, 1);
  assert.equal(deferred.state.records.length, 3);
});
