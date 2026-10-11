import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { runPipeline } from "../src/pipeline.mjs";
import { parseHaruNews } from "../src/parse.mjs";
import { collectionPages } from "../src/sources.mjs";

test("offline pipeline produces reconciled, checksummed artifacts without network or source mutation", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "neki-pipeline-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const generatedAt = "2026-09-26T00:00:00Z";
  const record = parseHaruNews(`<div class="card" onclick="location.href='/301/?bmode=view&idx=123'"><div class="title">콜라보 프레임 출시</div><small class="date">2026-09-18</small></div>`, collectionPages.find((page) => page.parser === "harufilm-news"))[0];
  record.observedAt = generatedAt;
  const excluded = { ...record, id: "brand-15:picdot-blog:123", brandId: "brand-15", brand: "픽닷", sourceKey: "picdot-blog", sourceUrl: "https://blog.naver.com/picdot_official/123" };
  const source = JSON.stringify({ schemaVersion: 1, lastRunAt: generatedAt, records: [record, excluded], diagnostics: [] });
  const stateFile = join(root, "state.json");
  await writeFile(stateFile, source);
  const options = { stateFile, outputDir: join(root, "artifacts"), offline: true, generatedAt, fetchImpl: () => assert.fail("offline must never request") };
  const result = await runPipeline(options);
  assert.equal(result.passed, true);
  assert.equal(result.quality.counts.normalized, 1);
  assert.deepEqual(result.quality.byBrand.map((brand) => brand.brand), ["포토이즘", "포토그레이", "인생네컷", "포토시그니처", "하루필름", "돈룩업"]);
  assert.equal(result.run.requestedSources, 0);
  assert.equal(result.run.inserted, null);
  assert.equal(await readFile(stateFile, "utf8"), source);
  for (const file of result.manifest.files) {
    const contents = await readFile(join(result.directory, file.name));
    assert.equal(contents.byteLength, file.bytes);
    assert.equal(createHash("sha256").update(contents).digest("hex"), file.sha256);
  }
  const rows = JSON.parse(await readFile(join(result.directory, "normalized.json"), "utf8"));
  assert.equal(rows.records.length, 1);
  assert.equal(JSON.parse(await readFile(join(result.directory, "frame-events.json"), "utf8")).records.length, 1);
  assert.match(await readFile(join(result.directory, "REPORT.md"), "utf8"), /정규화 1건/);
  const html = await readFile(join(result.directory, "REPORT.html"), "utf8");
  assert.match(html, /<!doctype html>/);
  assert.match(html, /콜라보 프레임 출시/);
  assert.match(html, /촬영 가능 여부 미확인/);
  assert.match(html, /<tr><td><a href=/);
  const repeated = await runPipeline(options);
  assert.notEqual(repeated.directory, result.directory);
});

test("pipeline reports quarantined records and fails the quality gate", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "neki-pipeline-invalid-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const stateFile = join(root, "state.json");
  await writeFile(stateFile, JSON.stringify({ schemaVersion: 1, records: [{ id: "invalid" }], diagnostics: [] }));
  const result = await runPipeline({ stateFile, outputDir: join(root, "artifacts"), offline: true });
  assert.equal(result.passed, false);
  assert.equal(result.quality.counts.rejected, 1);
  assert.equal(JSON.parse(await readFile(join(result.directory, "quarantine.json"), "utf8")).records.length, 1);
});
