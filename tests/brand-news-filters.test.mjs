import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { categoryOptions, filterNews, parseNewsCategory } from "../app/admin/features/brand-news/model/brand-news.ts";

const records = ["frame", "news", "collaboration", "event", "partnership"].flatMap((category, index) => [
  { id: `a-${category}`, brandId: "a", brandName: "인생네컷", title: `새 ${category}`, category, publishedOn: `2026-10-0${index + 1}` },
  { id: `b-${category}`, brandId: "b", brandName: "하루필름", title: `이전 ${category}`, category, publishedOn: "2026-09-01" },
]);
const defaults = { brand: "all", category: "all", query: "", sort: "published", direction: "descend" };

test("each category filters the stored collection without mutating it", () => {
  const before = structuredClone(records);
  assert.equal(filterNews(records, defaults).length, 10);
  for (const { value } of categoryOptions.filter(({ value }) => value !== "all")) {
    const result = filterNews(records, { ...defaults, category: value });
    assert.equal(result.length, 2);
    assert.ok(result.every((record) => record.category === value));
  }
  assert.deepEqual(records, before);
});

test("category combines with brand, search and sort", () => {
  assert.deepEqual(filterNews(records, { ...defaults, category: "frame", brand: "a", query: "  새  " }).map(({ id }) => id), ["a-frame"]);
  assert.equal(filterNews(records, { ...defaults, category: "news", brand: "a", query: "하루필름" }).length, 0);
  assert.deepEqual(filterNews(records, { ...defaults, category: "frame", direction: "ascend" }).map(({ id }) => id), ["b-frame", "a-frame"]);
});

test("absent and invalid URL categories safely default to all", () => {
  for (const value of [null, "", "all", "unknown", "__proto__", "toString", "FRAME"]) assert.equal(parseNewsCategory(value), "all");
  for (const { value } of categoryOptions) assert.equal(parseNewsCategory(value), value);
});

test("URL filter changes reset paging and reset clears category without losing sort", async () => {
  const root = new URL("../app/admin/features/brand-news/", import.meta.url);
  const hook = await readFile(new URL("model/useBrandNewsFilters.ts", root), "utf8");
  const screen = await readFile(new URL("ui/BrandNewsScreen.tsx", root), "utf8");
  assert.match(hook, /category: parseNewsCategory\(params\.get\("newsCategory"\)\)/);
  assert.match(screen, /aria-label="카테고리 필터"[^\n]+newsPage: "1"/);
  assert.match(screen, /newsBrand: "", newsCategory: "", newsQuery: "", newsPage: "1"/);
  assert.match(screen, /filtered=\{[^\n]+filters\.category !== "all"/);
});
