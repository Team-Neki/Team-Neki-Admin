import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { startTestServer, fetchWithTestSession as fetch } from "./server-test-helper.mjs";
import { validateBrandNews } from "../app/api/brand-news/brand-news-validation.ts";

const snapshot = {
  schemaVersion: 1, generatedAt: "2026-10-10T00:00:00Z",
  sources: [
    ["lifefourcuts-instagram", "brand-01", "인생네컷", "https://www.instagram.com/life4cuts_official/"],
    ["photoism-instagram", "brand-02", "포토이즘", "https://www.instagram.com/photoism.kr/"],
    ["photogray-instagram", "brand-03", "포토그레이", "https://www.instagram.com/photogray_official/"],
    ["dontlookup-instagram", "brand-14", "돈룩업", "https://www.instagram.com/dontlookup.official/"],
    ["photosignature-frames", "brand-05", "포토시그니처", "https://photosignature.co.kr/bbs/board.php?bo_table=frame"],
    ["harufilm-news", "brand-04", "하루필름", "https://harufilm.com/301"],
  ].map(([key, brandId, brandName, url]) => ({ key, brandId, brandName, url, status: "ok", recordCount: 0, failedPosts: [] })), records: [],
};

test("brand news image contract retains source order and rejects unsafe gallery URLs", () => {
  const record = { id: "brand-01:lifefourcuts-instagram:POST123", brandId: "brand-01", brandName: "인생네컷", title: "프레임", category: "frame", url: "https://www.instagram.com/life4cuts_official/p/POST123/", reviewStatus: "pending", warnings: [], imageUrls: ["https://scontent.cdninstagram.com/one.jpg", "https://scontent.cdninstagram.com/two.jpg"], excerpt: "수집된 게시 내용" };
  const data = { ...snapshot, sources: snapshot.sources.map((source, index) => ({ ...source, recordCount: index === 0 ? 1 : 0 })), records: [record] };
  const validated = validateBrandNews(data);
  assert.deepEqual(validated.records[0].imageUrls, record.imageUrls);
  assert.equal(validated.records[0].excerpt, record.excerpt);
  assert.throws(() => validateBrandNews({ ...data, records: [{ ...record, imageUrls: ["javascript:alert(1)"] }] }));
  assert.deepEqual(validateBrandNews({ ...data, records: [{ ...record, imageUrls: undefined, excerpt: undefined }] }).records[0].imageUrls, []);
});

test("brand news serves a shared validated snapshot and does not rescrape on refresh", async () => {
  const directory = await mkdtemp(join(tmpdir(), "neki-brand-news-"));
  const path = join(directory, "brand-news.json");
  await writeFile(path, JSON.stringify(snapshot));
  const server = await startTestServer({ BRAND_NEWS_DATA_FILE: path });
  try {
    const responses = await Promise.all(Array.from({ length: 5 }, () => fetch(`${server.baseUrl}/api/brand-news`)));
    assert.ok(responses.every((response) => response.status === 200));
    const first = await responses[0].json();
    assert.equal(first.snapshot.sources.length, 6);
    assert.equal(first.stale, false);
    await writeFile(path, "invalid-json");
    const cached = await (await fetch(`${server.baseUrl}/api/brand-news`)).json();
    assert.deepEqual(cached, first);
    const html = await (await fetch(server.baseUrl)).text();
    assert.match(html, /브랜드 소식/);
    const serverModule = await readFile(new URL("../app/api/brand-news/brand-news-server.ts", import.meta.url), "utf8");
    assert.doesNotMatch(serverModule, /playwright|collectCandidates|runCollection/);
  } finally { await server.stop(); await rm(directory, { recursive: true, force: true }); }
});

test("invalid live data returns an explicit error, not mock results", async () => {
  const directory = await mkdtemp(join(tmpdir(), "neki-brand-news-invalid-"));
  const path = join(directory, "brand-news.json");
  await writeFile(path, JSON.stringify({ ...snapshot, records: [{ url: "javascript:alert(1)" }] }));
  const server = await startTestServer({ BRAND_NEWS_DATA_FILE: path });
  try {
    const response = await fetch(`${server.baseUrl}/api/brand-news`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "브랜드 소식 데이터를 불러오지 못했습니다." });
  } finally { await server.stop(); await rm(directory, { recursive: true, force: true }); }
});
