import test from "node:test";
import assert from "node:assert/strict";
import { instagramImages } from "../src/instagram-media.mjs";
import { websiteImages, enrichWebsiteImages } from "../src/website-media.mjs";
import { selectedPages } from "../src/collection-scope.mjs";

const image = (name) => `https://scontent.cdninstagram.com/${name}.jpg`;
const signature = selectedPages.find((source) => source.parser === "photosignature");
const haru = selectedPages.find((source) => source.parser === "harufilm-news");

test("Instagram carousel belongs to the exact shortcode, in source order, without avatars", () => {
  const document = JSON.stringify({ other: { shortcode: "OTHER123", carousel_media: [{ display_url: image("other") }] }, post: {
    code: "POST123", carousel_media: [{ image_versions2: { candidates: [{ width: 100, url: image("small") }, { width: 1000, url: image("first") }] } }, { display_url: image("second") }, { display_url: "javascript:bad" }],
  } });
  assert.deepEqual(instagramImages([document], "POST123", image("cover")), [image("first"), image("second")]);
  assert.deepEqual(instagramImages([document], "UNSEEN123", image("cover")), [image("cover")]);
  assert.deepEqual(instagramImages(["malformed"], "POST123", undefined), []);
});

test("website detail selectors exclude logos, comments and untrusted images", () => {
  const html = '<img src="/logo.png"><div class="view_image"><img src="/a.png"><img src="/b.png"><img src="/a.png"><img src="https://evil.example/a.png"></div>';
  assert.deepEqual(websiteImages(html, signature), ["https://photosignature.co.kr/a.png", "https://photosignature.co.kr/b.png"]);
  assert.deepEqual(websiteImages('<div class="board_txt_area"><img src="https://cdn.imweb.me/a.jpg"></div><img src="https://cdn.imweb.me/logo.jpg">', haru), ["https://cdn.imweb.me/a.jpg"]);
});

test("website gallery refresh is bounded, persistent and skipped for 24 hours", async () => {
  const records = [1, 2].map((n) => ({ id: `post-${n}`, sourceKey: signature.key, sourceUrl: `${signature.url}&wr_id=${n}`, title: "프레임", imageUrl: "https://photosignature.co.kr/cover.png" }));
  const observedAt = "2026-10-10T12:00:00Z";
  let calls = 0;
  const options = { observedAt, limit: 1, wait: async () => {}, readHtml: async () => { calls++; return '<div class="view_image"><img src="/a.png"><img src="/b.png"></div>'; } };
  const first = await enrichWebsiteImages(records, signature, options);
  assert.equal(calls, 1);
  assert.equal(first.records[0].imageUrls.length, 2);
  assert.equal(first.records[1].imageUrls, undefined);
  const next = await enrichWebsiteImages([records[0]], signature, { ...options, previous: { records: first.records }, observedAt: "2026-10-10T18:00:00Z" });
  assert.equal(calls, 1);
  assert.deepEqual(next.records[0].imageUrls, first.records[0].imageUrls);
});

test("website access limits stop detail work without blacklisting a post", async () => {
  const records = [1, 2].map((n) => ({ id: `post-${n}`, sourceUrl: `${signature.url}&wr_id=${n}`, title: "프레임" }));
  let calls = 0;
  const result = await enrichWebsiteImages(records, signature, { observedAt: "2026-10-10T12:00:00Z", wait: async () => {}, readHtml: async () => { calls++; throw Object.assign(new Error("HTTP 429"), { code: "rate-limited", retryAfterMs: 3600000 }); } });
  assert.equal(calls, 1);
  assert.equal(result.failureCode, "rate-limited");
  assert.deepEqual(result.failedPosts, []);
});
