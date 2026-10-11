import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { newsSourceLabel } from "../app/admin/features/brand-news/model/news-source.ts";

test("post origins distinguish Instagram, official websites and unverified hosts", () => {
  for (const host of ["instagram.com", "www.instagram.com"]) assert.equal(newsSourceLabel(`https://${host}/life4cuts_official/p/POST/`), "인스타그램");
  for (const host of ["photosignature.co.kr", "www.photosignature.co.kr", "harufilm.com", "www.harufilm.com"]) assert.equal(newsSourceLabel(`https://${host}/post`), "공식 홈페이지");
  for (const host of ["instagram.com.evil.example", "fakeharufilm.com", "scontent.cdninstagram.com"]) assert.equal(newsSourceLabel(`https://${host}/post`), host);
  for (const url of ["invalid", "javascript:alert(1)", "file:///post"]) assert.equal(newsSourceLabel(url), "출처 미확인");
});

test("list and detail expose the same source classification without changing API contracts", async () => {
  for (const name of ["BrandNewsGrid", "BrandNewsDetail"]) {
    const source = await readFile(new URL(`../app/admin/features/brand-news/ui/${name}.tsx`, import.meta.url), "utf8");
    assert.match(source, /newsSourceLabel\(record\.url\)/);
  }
});

test("gallery defaults to whole-image fit and preserves keyboard-accessible recovery and preview", async () => {
  const root = new URL("../app/admin/features/brand-news/ui/", import.meta.url);
  const [gallery, image, css] = await Promise.all(["NewsGallery.tsx", "NewsImage.tsx", "BrandNewsScreen.module.css"].map((name) => readFile(new URL(name, root), "utf8")));
  assert.match(gallery, /useState<"contain" \| "width">\("contain"\)/);
  assert.match(gallery, /<Segmented<"contain" \| "width"> name=/);
  assert.match(gallery, /<div key=\{current\}/); // Switching fit must not remount/reload the image.
  assert.match(gallery, /focusable=\{\{ trap: true, focusTriggerAfterClose: true \}\}/);
  assert.match(gallery, /destroyOnHidden/);
  assert.match(gallery, /images\.length > 1/);
  assert.match(gallery, /aria-pressed=\{index === current\}/);
  assert.match(image, /key=\{attempt\} src=\{src\}/);
  assert.match(image, /referrerPolicy="no-referrer"/);
  assert.match(image, /onLoad=\{\(\) => setState\("ready"\)\}/);
  assert.match(image, /onError=\{\(\) => setState\("error"\)\}/);
  assert.match(css, /\.hero \{ height: clamp\([^}]+overflow: auto/);
  assert.match(css, /\.image img \{ display: block;[^}]+object-fit: contain/);
  assert.match(css, /\.image\[data-fit="width"\] img \{ height: auto/);
});
