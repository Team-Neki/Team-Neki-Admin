import test from "node:test";
import assert from "node:assert/strict";
import { normalizeRecords, koreaDay } from "../src/normalize.mjs";
import { profileDataset } from "../src/quality.mjs";

const generatedAt = "2026-09-26T00:00:00Z";
const sample = (changes = {}) => ({
  id: "brand-05:photosignature-frames:123", brandId: "brand-05", brand: "wrong-input-label",
  sourceKey: "photosignature-frames", externalId: "123", sourceUrl: "https://photosignature.co.kr/bbs/board.php?wr_id=123&bo_table=frame&tracking=remove#top",
  title: "  신규\u200b   프레임  ", kind: "frame", publishedOn: "2026-09-21", rawDateText: "09.09~10.31",
  startsOn: "2026-09-09", endsOn: "2026-10-31", imageUrl: "https://cdn.example.com/frame.jpg",
  excerpt: null, sourceStatus: "unknown", reviewStatus: "pending", fingerprint: "a".repeat(64), observedAt: generatedAt, ...changes,
});
const options = { generatedAt };

test("normalizes strings, brand authority, tracked URLs and explicit provenance", () => {
  const result = normalizeRecords([sample()], options);
  assert.equal(result.rejected.length, 0);
  const row = result.records[0];
  assert.equal(row.title, "신규 프레임");
  assert.equal(row.brand.name, "포토시그니처");
  assert.equal(row.source.url, "https://photosignature.co.kr/bbs/board.php?bo_table=frame&wr_id=123");
  assert.equal(row.period.yearBasis, "publication-year");
  assert.equal(row.status.availability, "unverified");
  assert.equal(row.scope.type, "unverified");
  assert.equal(row.status.calendarHint, "within-listed-period");
});

test("Korea day changes at local midnight and timestamps become canonical", () => {
  assert.equal(koreaDay("2026-09-25T15:00:00Z"), "2026-09-26");
  assert.equal(normalizeRecords([], { generatedAt: "2026/09/26" }).generatedAt.includes("/"), false);
  assert.throws(() => koreaDay("not-a-time"), /timestamp/);
});

test("invalid required fields or mismatching official URLs are quarantined", () => {
  const result = normalizeRecords([
    sample({ title: "" }), sample({ sourceUrl: "https://evil.example.com/frame" }),
    sample({ externalId: "456" }), sample({ brandId: "brand-02" }), sample({ sourceKey: "unknown" }),
    sample({ fingerprint: "bad" }), sample({ sourceUrl: "https://photosignature.co.kr/bbs/board.php?bo_table=frame&wr_id=456" }), null,
  ], options);
  assert.equal(result.records.length, 0);
  assert.equal(result.rejected.length, 8);
});

test("duplicate rows collapse but conflicting source posts are not silently selected", () => {
  const duplicate = normalizeRecords([sample(), sample({ observedAt: "2026-09-26T01:00:00Z" })], options);
  assert.equal(duplicate.records.length, 1);
  assert.equal(duplicate.duplicatesCollapsed, 1);
  assert.equal(duplicate.records[0].source.observedAt, "2026-09-26T01:00:00.000Z");
  const conflicting = normalizeRecords([sample(), sample({ title: "다른 프레임" })], options);
  assert.equal(conflicting.records.length, 0);
  assert.equal(conflicting.rejected.length, 2);
  assert.deepEqual(conflicting.rejected[0].reasons, ["conflicting-duplicate"]);
});

test("invalid optional dates and insecure image links are nulled with warnings", () => {
  const [row] = normalizeRecords([sample({ publishedOn: "2026-02-30", imageUrl: "javascript:alert(1)", startsOn: "2026-10-31", endsOn: "2026-09-09" })], options).records;
  assert.equal(row.publishedOn, null);
  assert.equal(row.media.imageUrl, null);
  assert.equal(row.period.startsOn, null);
  assert.equal(row.period.endsOn, null);
  assert.ok(row.quality.warnings.includes("reversed-period"));
  assert.ok(row.quality.warnings.includes("unsafe-image-url"));
});

const blog = (changes = {}) => sample({ id: "brand-15:picdot-blog:123", brandId: "brand-15", sourceKey: "picdot-blog",
  sourceUrl: "https://blog.naver.com/picdot_official/123?fromRss=true", title: "매장 소식", kind: "news", ...changes });

test("title/category evidence is distinct from body-only keyword leads", () => {
  const [row] = normalizeRecords([blog({ excerpt: "새로운 프레임과 이벤트 소개" })], options).records;
  assert.equal(row.classification.primary, "news");
  assert.equal(row.relevance, "possible-related-news");
  assert.ok(row.quality.warnings.includes("body-keyword-only"));
  const collaboration = normalizeRecords([blog({ title: "캐릭터 콜라보 프레임 출시" })], options).records[0];
  assert.deepEqual(collaboration.classification.tags, ["collaboration", "frame"]);
  assert.equal(collaboration.relevance, "frame-event");
});

test("blog account and URL credentials remain strict", () => {
  assert.equal(normalizeRecords([blog({ sourceUrl: "https://blog.naver.com/not_official/123" })], options).records.length, 0);
  assert.equal(normalizeRecords([blog({ sourceUrl: "https://user:password@blog.naver.com/picdot_official/123" })], options).records.length, 0);
});

test("quality checks reconcile totals, null rates, source coverage and temporal hints", () => {
  const dataset = normalizeRecords([sample({ endsOn: null }), blog({ title: "제휴 안내", publishedOn: null })], options);
  const profile = profileDataset(dataset);
  assert.equal(profile.counts.normalized, 2);
  assert.equal(profile.counts.frameEvents, 1);
  assert.equal(profile.counts.partnerships, 1);
  assert.equal(profile.missing.publishedOn.count, 1);
  assert.equal(profile.missing.publishedOn.rate, 0.5);
  assert.equal(profile.frameEventPeriodMissing.total, 1);
  assert.equal(profile.frameEventPeriodMissing.endsOn, 1);
  assert.equal(profile.byBrand.length, 17);
  assert.equal(profile.byBrand.filter((brand) => brand.records).length, 2);
  assert.ok(Object.values(profile.checks).every(Boolean));
});

test("empty datasets retain unknown null rates and future publication warnings", () => {
  const empty = profileDataset(normalizeRecords([], options));
  assert.equal(empty.missing.publishedOn.rate, null);
  const future = profileDataset(normalizeRecords([sample({ publishedOn: "2026-09-27" })], options));
  assert.equal(future.futurePublicationIds.length, 1);
});
