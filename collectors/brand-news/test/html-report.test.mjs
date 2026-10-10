import test from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { renderHtmlReport } from "../src/html-report.mjs";
import { brandSources } from "../src/sources.mjs";
import { parserMethods, pendingMethods } from "../src/source-methods.mjs";
import { selectedBrands, selectedPages } from "../src/collection-scope.mjs";

test("HTML escapes collected text, refuses unsafe links and contains all stored rows", () => {
  const row = { title: '<script>alert("unsafe")</script>', brand: { id: "brand-05", name: "포토시그니처" },
    source: { key: "photosignature-frames", url: "javascript:alert(1)", observedAt: "2026-09-26T00:00:00Z" },
    classification: { primary: "frame" }, media: { imageUrl: 'javascript:alert("image")' },
    period: { startsOn: null, endsOn: null }, publishedOn: null, status: { reportedEnded: false } };
  const dataset = { records: [row], generatedAt: "2026-09-27T00:00:00Z" };
  const quality = { byBrand: [{ brandId: "brand-05", brand: "포토시그니처", records: 1 }],
    counts: { normalized: 1, frameEvents: 1 }, frameEventPeriodMissing: { endsOn: 1 } };
  const html = renderHtmlReport(dataset, quality);
  const $ = cheerio.load(html);
  assert.equal($("script").length, 1);
  assert.doesNotMatch($("script").text(), /unsafe/);
  assert.match($("meta[http-equiv='Content-Security-Policy']").attr("content"), /script-src 'sha256-/);
  assert.equal($("a[href^='javascript:'], img[src^='javascript:']").length, 0);
  assert.equal($(".post-list tbody tr").length, 1);
  assert.equal($("article").length, 1);
  assert.equal($(".image-fallback a").length, 0);
  assert.match($(".image-fallback").text(), /원문에서 이미지 보기/);
  assert.match($("h3").text(), /<script>/);
  assert.match(html, /2026-09-26/);
  assert.match($("meta[http-equiv='Content-Security-Policy']").attr("content"), /default-src 'none'/);
});

test("report includes only the six selected brands and shows every brand in results", () => {
  const records = selectedPages.map((page) => ({ title: `${page.brand} 실측 게시물`,
    brand: { id: page.brandId, name: page.brand }, source: { key: page.key, url: page.url, observedAt: "2026-09-26T00:00:00Z" },
    classification: { primary: "frame" }, media: { imageUrl: null }, period: { startsOn: null, endsOn: null },
    publishedOn: null, status: { reportedEnded: false } }));
  const byBrand = brandSources.map((brand) => ({ ...brand, sourceStatus: brand.status,
    records: brand.status === "enabled" ? 1 : 0, frameEvents: brand.status === "enabled" ? 1 : 0 }));
  const $ = cheerio.load(renderHtmlReport({ records, generatedAt: "2026-09-27T00:00:00Z" }, {
    byBrand, counts: { normalized: 4, frameEvents: 4 }, frameEventPeriodMissing: { endsOn: 4 },
  }));
  assert.equal($(".brand-list a").length, 6);
  assert.equal($(".method").length, 6);
  assert.equal($(".method[open]").length, 6);
  assert.equal($("#results .result-table tbody tr").length, 6);
  assert.equal($(".post-list tbody tr").length, 6);
  assert.deepEqual($("#results .result-table tbody tr td:first-child").toArray().map((node) => $(node).text()), selectedBrands.map((brand) => brand.brand));
  assert.match($("header .summary").text(), /전체 6건/);
  for (const brand of selectedBrands) {
    const section = $(`#method-${brand.brandId}`);
    assert.match(section.text(), new RegExp(brand.brand));
    if (brand.status === "enabled") {
      const parser = selectedPages.find((page) => page.brandId === brand.brandId).parser;
      assert.ok(section.text().includes(parserMethods[parser].method));
      assert.match(section.text(), /추출 확인 · 무인 운영 미검증/);
    } else {
      assert.ok(section.text().includes(pendingMethods[brand.brandId].method));
      assert.match(section.text(), /미수집 · 새 소식이 없다는 뜻이 아님/);
      assert.match(section.text(), /2026-09-25/);
      assert.doesNotMatch(section.text(), /수집 검증 완료/);
    }
  }
  for (const brand of brandSources.filter((brand) => !selectedBrands.includes(brand))) {
    assert.equal($(`#method-${brand.brandId}`).length, 0);
    assert.ok(!$("body").text().includes(brand.brand));
  }
  assert.match($(".policy").text(), /6시간/);
  assert.match($(".policy").text(), /GitHub Actions 예약 수집·공유 데이터 브랜치·어드민 조회 탭은 코드로 구성/);
  assert.equal($(".operation-table tbody tr").length, 6);
  assert.match($("#operations").text(), /장기간 무인 반복 실행/);
  assert.match($("#operations").text(), /PR 머지 후 첫 실행이 필요/);
});

test("report does not disguise historical partial detail failures as success", () => {
  const $ = cheerio.load(renderHtmlReport({ records: [], generatedAt: "2026-10-10T00:00:00Z" }, {
    byBrand: [], diagnostics: [{ sourceKey: "photogray-instagram", status: "ok", detailFailures: 3 }],
  }));
  assert.match($("#method-brand-03").text(), /일부 실패 · 상세 3건 실패/);
  const row = $(".operation-table tbody tr").toArray().find((node) => $(node).text().includes("포토그레이"));
  assert.match($(row).text(), /일부 실패/);
});
