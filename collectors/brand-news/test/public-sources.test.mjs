import test from "node:test";
import assert from "node:assert/strict";
import { parseImwebGallery, parseInstagramSnapshot } from "../src/parse.mjs";
import { normalizeRecords } from "../src/normalize.mjs";
import { collectionPages } from "../src/sources.mjs";
import { collectCandidates } from "../src/collect.mjs";
import { selectedPages, selectSourceRecords } from "../src/collection-scope.mjs";

const gallery = collectionPages.find((s) => s.parser === "imweb-gallery");
const instagram = collectionPages.find((s) => s.account === "dontlookup.official");
const escape = (value) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
const snapshot = (description, url = "https://www.instagram.com/dontlookup.official/p/DdbEJ50gexl/") => `<main data-source-account="dontlookup.official"><article data-post-url="${url}" data-description="${escape(description)}" data-image="https://cdn.example.com/image.jpg"></article></main>`;

test("Life4Cuts uses official Instagram while retaining but excluding gallery history", () => {
  const [source] = selectedPages.filter((page) => page.brandId === "brand-01");
  assert.equal(source.account, "life4cuts_official");
  assert.equal(source.key, "lifefourcuts-instagram");
  const [record] = parseInstagramSnapshot(snapshot('dontlookup.official - October 9, 2026: "콜라보 프레임 공개".').replaceAll("dontlookup.official", source.account), source);
  const galleryHistory = { brandId: "brand-01", sourceKey: "lifefourcuts-frames" };
  const selected = selectSourceRecords([galleryHistory, record]);
  assert.deepEqual(selected, [record]);
  const dataset = normalizeRecords(selected);
  assert.equal(dataset.rejected.length, 0);
  assert.equal(dataset.records[0].brand.name, "인생네컷");
  assert.equal(dataset.records[0].publishedOn, "2026-10-09");
  assert.match(dataset.records[0].source.url, /life4cuts_official\/p\//);
});

test("gallery keeps official titles, stable IDs and unknown dates, excluding duplicate image wrappers", () => {
  const html = `<div class="img_wrap" id="gal_item_123_img"></div><div class="text_wrap" id="gal_item_123" data-src="https://cdn.imweb.me/frame.png"><p class="title">2026년 2월 생일</p></div><div class="text_wrap" id="gal_item_123"></div>`;
  const rows = parseImwebGallery(html, gallery);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].publishedOn, null);
  assert.equal(rows[0].startsOn, null);
  assert.equal(rows[0].sourceUrl, "https://lifefourcuts.com/Frame01#caption_123");
  rows[0].observedAt = "2026-09-27T00:00:00Z";
  const normalized = normalizeRecords(rows);
  assert.equal(normalized.rejected.length, 0);
  assert.equal(normalized.records[0].classification.primary, "frame");
  assert.match(normalized.records[0].source.url, /#caption_123$/);
});

test("public Instagram parses English and Korean-localized author metadata without comments", () => {
  for (const marker of [" - ", " on "]) {
    const html = snapshot(`20 likes, 2 comments - dontlookup.official${marker}September 18, 2026: "#EVENT\n[2026 부산 X 돈룩업]\n\n공식 이벤트입니다.".`);
    const [row] = parseInstagramSnapshot(html, instagram);
    assert.equal(row.publishedOn, "2026-09-18");
    assert.equal(row.title, "#EVENT · [2026 부산 X 돈룩업]");
    assert.equal(row.excerpt.startsWith("#EVENT"), true);
    row.observedAt = "2026-09-27T00:00:00Z";
    assert.equal(normalizeRecords([row]).rejected.length, 0);
  }
});

test("decorative blank lines and wrapped frame titles retain the full first paragraph", () => {
  const [row] = parseInstagramSnapshot(snapshot(`20 likes, 2 comments - dontlookup.official on September 18, 2026: "⠀\nPHOTOISM X 아티스트\nARTIST FRAME OPEN !\n\n본문".`), instagram);
  assert.equal(row.title, "PHOTOISM X 아티스트 ARTIST FRAME OPEN !");
});

test("Instagram author, profile identity and canonical post path must match source", () => {
  const desc = `20 likes, 2 comments - dontlookup.official on September 18, 2026: "프레임 안내".`;
  assert.equal(parseInstagramSnapshot(snapshot(desc.replace("dontlookup.official", "unrelated")), instagram).length, 0);
  assert.equal(parseInstagramSnapshot(snapshot('unrelated - October 9, 2026: "언급 - dontlookup.official - October 9, 2026: 프레임 안내".'), instagram).length, 0);
  assert.equal(parseInstagramSnapshot(snapshot(desc, "https://www.instagram.com/unrelated/p/DdbEJ50gexl/"), instagram).length, 0);
  assert.equal(parseInstagramSnapshot(snapshot(desc).replace('data-source-account="dontlookup.official"', 'data-source-account="unrelated"'), instagram).length, 0);
  const [row] = parseInstagramSnapshot(snapshot(desc), instagram);
  row.sourceUrl = "https://www.instagram.com/dontlookup.official/p/OTHERID/";
  assert.ok(normalizeRecords([row]).rejected[0].reasons.includes("untrusted-or-inconsistent-source-url"));
});

test("browser transport stays selected across all sources if a dependency wraps global fetch", async () => {
  const original = globalThis.fetch;
  const pages = collectionPages.filter((page) => page.parser === "instagram-public").slice(0, 2);
  let calls = 0;
  try {
    const result = await collectCandidates({ pages, browserFetchImpl: async (page) => {
      calls += 1;
      globalThis.fetch = () => assert.fail("must not switch back to raw HTTP mid-run");
      return snapshot('1 likes, 0 comments - dontlookup.official on September 18, 2026: "프레임 안내".').replaceAll("dontlookup.official", page.account);
    } });
    assert.equal(calls, 2);
    assert.equal(result.candidates.length, 2);
    assert.ok(result.diagnostics.every((d) => d.status === "ok"));
  } finally { globalThis.fetch = original; }
});
