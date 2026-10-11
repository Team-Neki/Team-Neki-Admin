import { mkdir, mkdtemp, rename, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { renderHtmlReport } from "./html-report.mjs";

const labels = { collaboration: "콜라보", frame: "프레임", event: "이벤트", partnership: "제휴", news: "일반 소식" };
const cell = (value) => String(value ?? "—").replace(/\|/g, "\\|").replace(/\s+/g, " ");
const percentage = (value) => value === null ? "—" : `${(value * 100).toFixed(1)}%`;

export function renderReport(quality, run) {
  const counts = quality.counts;
  const lines = [
    "# 브랜드 소식 수집·정규화 결과",
    "",
    `생성 시각: ${quality.generatedAt}. 날짜 기준: ${quality.asOfDay} (Asia/Seoul).`,
    "",
    "## 결과",
    "",
    `원문 ${counts.input}건 → 정규화 ${counts.normalized}건. 중복 병합 ${counts.duplicatesCollapsed}건, 격리 ${counts.rejected}건.`,
    `프레임·콜라보·이벤트 후보 ${counts.frameEvents}건, 본문 키워드만 있는 관련 가능 소식 ${counts.possibleRelated}건, 제휴 ${counts.partnerships}건, 일반 소식 ${counts.generalNews}건.`,
    "",
    "한 행은 공식 출처의 원문 게시물 1건이다. 같은 콜라보의 브랜드별 공지를 합치지 않는다. 여러 프레임을 소개하는 글도 1건으로 남긴다.",
    `원문에 종료가 명시된 후보 ${counts.reportedEnded}건. 모든 촬영 가능 여부와 부스별 적용 범위는 미확인이다. 현재 촬영 가능한 프레임 수로 해석하면 안 된다.`,
    "",
    "## 실행",
    "",
    `모드: ${run.mode}. 이번 출처 요청 ${run.requestedSources}개, 캐시/대기 처리 ${run.cachedSources}개, 출처 오류/대기 ${run.failures}개.`,
    `신규 ${run.inserted}건, 수정 ${run.changed}건. 오프라인 모드의 신규·수정 값은 null이며 새 수집 결과를 의미하지 않는다.`,
    "",
    "출처 요청 수는 조회한 출처 개수다. 네트워크 재시도까지 포함한 실제 HTTP 횟수는 별도로 계측하지 않았다.",
    "",
    "## 브랜드별 범위",
    "",
    "| 브랜드 | 정규화 | 프레임·이벤트 후보 | 최근 게시일 | 수집원 상태 |",
    "| --- | ---: | ---: | --- | --- |",
    ...quality.byBrand.map((brand) => `| ${cell(brand.brand)} | ${brand.records} | ${brand.frameEvents} | ${cell(brand.latestPublication)} | ${cell(brand.sourceStatus)} |`),
    "",
    "0건인 비활성 브랜드는 신규 소식이 없다는 뜻이 아니라 검증된 수집원이 아직 없다는 뜻이다. 최신 게시일은 원문 발행일이지 수집 실행일이 아니다.",
    "",
    "## 정규화 유형",
    "",
    "| 유형 | 건수 |",
    "| --- | ---: |",
    ...Object.entries(quality.byKind).map(([kind, count]) => `| ${labels[kind] ?? cell(kind)} | ${count} |`),
    "",
    "제목 키워드와 원문 카테고리로 분류한 검토 힌트다. 본문에만 키워드가 있으면 확정 프레임 후보에 넣지 않고 별도 관련 가능 소식으로 둔다.",
    "",
    "## 데이터 품질",
    "",
    "| 항목 | 누락 건수 | 누락 비율 |",
    "| --- | ---: | ---: |",
    ...Object.entries(quality.missing).map(([field, stats]) => `| ${field} | ${stats.count} | ${percentage(stats.rate)} |`),
    "",
    `고유 ID ${counts.uniqueIds}개. 잘못된 선택 값 ${counts.invalidOptionalValues}개. 검토 대기 ${counts.needsReview}건, 경고 있는 행 ${counts.withWarnings}건.`,
    "",
    `- 높은 위험: 프레임·이벤트 후보 ${quality.frameEventPeriodMissing.total}건 중 시작일 미확인 ${quality.frameEventPeriodMissing.startsOn}건, 종료일 미확인 ${quality.frameEventPeriodMissing.endsOn}건이다. 원문 목록에 날짜가 없거나 이미지에만 있어 현재 진행 중인 이벤트를 자동 확정하는 용도로는 부적합하다. 상세 원문/이미지를 검토해야 한다.`,
    "- 중간 위험: 게시일 누락은 최신 소식 순서·신규성 판단에 영향을 준다. 목록 관측 시각으로 게시일을 대체하지 않는다.",
    "- 기간이 있더라도 부스 적용·조기 종료·공지 변경을 확인해야 한다. `calendarHint`는 날짜 비교일 뿐 운영 상태가 아니다.",
    "- 유효하지 않은 필수값·원문 URL·상충 중복은 격리한다. 선택 날짜 오류는 null로 바꾸고 경고를 남긴다.",
    "",
    "검증 결과:",
    "",
    ...Object.entries(quality.checks).map(([name, passed]) => `- ${name}: ${passed ? "통과" : "실패"}`),
    "",
    "## 산출물",
    "",
    "- [REPORT.html](REPORT.html): 대상 브랜드·브랜드별 수집 방법·실제 수집 결과와 이미지·기간·원문 링크·전체 목록.",
    "- [source-records.json](source-records.json): 정규화 전의 누적 원문 후보. 원본 HTML 전체는 저장하지 않는다.",
    "- [normalized.json](normalized.json): 공통 스키마 전체 데이터.",
    "- [frame-events.json](frame-events.json): 제목/원문 카테고리 근거가 있는 프레임·콜라보·이벤트 후보.",
    "- [review-queue.json](review-queue.json): 검토 대기 ID, 분류, 원문 URL, 경고.",
    "- [quarantine.json](quarantine.json): 필수값·출처·상충 중복 오류 기록.",
    "- [quality.json](quality.json): 건수·결측률·유효성·브랜드별 품질 결과.",
    "- [coverage.json](coverage.json): 현재 대상 브랜드의 수집원 상태와 누락 범위.",
    "- [run.json](run.json): 실행 모드·신규/수정 ID·출처별 성공/오류 기록.",
    "- [manifest.json](manifest.json): 각 파일의 바이트 수와 SHA-256.",
    "",
    "## 출처와 미완료 범위",
    "",
    ...quality.byBrand.filter((brand) => brand.records > 0).map((brand) => `- ${cell(brand.brand)}: ${brand.sourceUrl}`),
    "",
    "웹 목록은 첫 페이지 범위다. 공식 SNS는 로그인 없는 공개 프로필에서 해당 계정 경로로 연결된 최대 12개 글의 상세 메타데이터를 순차 추출한다. 공동 게시물·전체 이력 백필·이미지 OCR은 포함하지 않는다.",
    "이미지는 URL 참조만 저장하며 SNS 서명 URL은 만료될 수 있다. 이미지 복제·재배포 권리, 자동 수집 정책을 별도 확인해야 한다. 보고서 사이트는 정적 스냅샷이며 예약 실행·어드민 연결은 수행하지 않았다.",
    "",
  ];
  return lines.join("\n");
}

export async function writeArtifacts({ outputDir, sourceRecords, dataset, quality, run }) {
  const root = resolve(outputDir);
  await mkdir(root, { recursive: true });
  const staging = await mkdtemp(join(root, ".staging-"));
  const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
  const envelope = (records) => ({ schemaVersion: dataset.schemaVersion, generatedAt: dataset.generatedAt, asOfDay: dataset.asOfDay, grain: dataset.grain, records });
  const coverage = { schemaVersion: 1, generatedAt: dataset.generatedAt, registeredBrands: quality.byBrand.length,
    brandsWithRecords: quality.byBrand.filter((brand) => brand.records > 0).length, brands: quality.byBrand };
  const files = {
    "source-records.json": json({ schemaVersion: 1, generatedAt: dataset.generatedAt, records: sourceRecords }),
    "normalized.json": json(envelope(dataset.records)),
    "frame-events.json": json(envelope(dataset.records.filter((record) => record.relevance === "frame-event"))),
    "review-queue.json": json(envelope(dataset.records.filter((record) => record.status.review === "pending").map((record) => ({ id: record.id, brand: record.brand.name,
      title: record.title, relevance: record.relevance, sourceUrl: record.source.url, warnings: record.quality.warnings })))),
    "quarantine.json": json({ schemaVersion: 1, generatedAt: dataset.generatedAt, records: dataset.rejected }),
    "quality.json": json(quality),
    "coverage.json": json(coverage),
    "run.json": json(run),
    "REPORT.md": renderReport(quality, run),
    "REPORT.html": renderHtmlReport(dataset, quality),
  };
  const manifest = { schemaVersion: 1, generatedAt: dataset.generatedAt, normalizationVersion: "1",
    counts: quality.counts, files: Object.entries(files).map(([name, content]) => ({ name, bytes: Buffer.byteLength(content), sha256: createHash("sha256").update(content).digest("hex") })) };
  for (const [name, content] of Object.entries(files)) await writeFile(join(staging, name), content, { flag: "wx" });
  await writeFile(join(staging, "manifest.json"), json(manifest), { flag: "wx" });
  const directory = join(root, `${dataset.generatedAt.replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`);
  await rename(staging, directory);
  return { directory, manifest };
}
