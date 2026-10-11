import { createHash } from "node:crypto";
import { parserMethods, pendingMethods, brandMethodEvidence } from "./source-methods.mjs";
import { selectedBrands, selectedBrandIds, selectedPages } from "./collection-scope.mjs";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const labels = { collaboration: "콜라보", frame: "프레임", event: "이벤트", partnership: "제휴", news: "일반 소식" };
const imageFallbackScript = `document.querySelectorAll(".image img").forEach((image) => {
  const hideBrokenImage = () => image.remove();
  image.addEventListener("error", hideBrokenImage, { once: true });
  if (image.complete && !image.naturalWidth) hideBrokenImage();
});`;
const imageFallbackHash = createHash("sha256").update(imageFallbackScript).digest("base64");

function safeHref(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function link(row, label = row.title) {
  const href = safeHref(row.source.url);
  return href ? `<a href="${escape(href)}" target="_blank" rel="noopener noreferrer">${escape(label)}</a>` : escape(label);
}

function period(row) {
  if (row.period.startsOn && row.period.endsOn) return `${row.period.startsOn} ~ ${row.period.endsOn}`;
  if (row.period.startsOn) return `${row.period.startsOn} ~ 종료일 미확인`;
  return "기간 미확인";
}

function card(row) {
  const image = safeHref(row.media.imageUrl);
  return `<article class="item">
    <div class="image"><span class="image-fallback">${link(row, "원문에서 이미지 보기 ↗")}</span>${image ? `<img src="${escape(image)}" alt="${escape(row.title)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ""}</div>
    <div class="item-body"><div class="meta">${escape(row.brand.name)} <span>${escape(labels[row.classification.primary] ?? "소식")}</span></div>
    <h3>${link(row)}</h3><dl><div><dt>게시일</dt><dd>${escape(row.publishedOn ?? "미표기")}</dd></div><div><dt>기간</dt><dd>${escape(period(row))}</dd></div></dl>
    ${row.status.reportedEnded ? '<span class="ended">원문에 종료 표기</span>' : '<span class="unverified">촬영 가능 여부 미확인</span>'}
    <div class="source-link">${link(row, "원문 보기 ↗")}</div></div>
  </article>`;
}

function tableRow(row) {
  return `<tr><td>${link(row)}${row.content?.excerpt ? `<details><summary>수집한 본문</summary><p>${escape(row.content.excerpt)}</p></details>` : ""}</td><td>${escape(labels[row.classification.primary] ?? "소식")}</td><td>${escape(row.publishedOn ?? "—")}</td><td>${escape(period(row))}</td><td>${row.status.reportedEnded ? "원문 종료 표기" : "미확인"}</td></tr>`;
}

function methodCard(brand, rows, diagnostics = []) {
  const page = selectedPages.find((entry) => entry.brandId === brand.brandId);
  const implemented = brand.sourceStatus === "enabled" && Boolean(page);
  const annotation = implemented ? parserMethods[page.parser] : pendingMethods[brand.brandId];
  const href = safeHref(page?.url ?? brand.sourceUrl);
  const selected = rows.filter((row) => row.brand.id === brand.brandId);
  const observed = selected.map((row) => row.source.observedAt).filter(Boolean).sort().at(-1);
  const diagnostic = diagnostics.find((entry) => entry.sourceKey === page?.key);
  const evidence = brandMethodEvidence[brand.brandId];
  return `<details class="method" id="method-${escape(brand.brandId)}"${implemented ? " open" : ""}>
    <summary>${escape(brand.brand)} <span class="method-status">${selected.length ? "추출 확인 · 무인 운영 미검증" : "수집 결과 없음"}</span></summary>
    <div class="method-body"><div class="source-link">${href ? `<a href="${escape(href)}" target="_blank" rel="noopener noreferrer">${implemented ? "수집 출처" : "조사한 출처"} ↗</a>` : "확정된 수집원 없음"}</div>
    <dl><div><dt>${implemented ? "수집 방법" : "검토 경로"}</dt><dd>${escape(annotation?.method ?? "공식 수집원 확인 필요")}</dd></div>
    <div><dt>추출 항목</dt><dd>${implemented ? escape(annotation?.fields) : "미구현"}</dd></div>
    ${evidence ? `<div><dt>공식 근거</dt><dd><a href="${escape(evidence.url)}" target="_blank" rel="noopener noreferrer">${escape(evidence.text)}</a></dd></div><div><dt>수집 범위</dt><dd>${escape(evidence.scope)}</dd></div>` : ""}
    ${page?.account ? `<div><dt>계정</dt><dd>@${escape(page.account)}</dd></div>` : ""}
    <div><dt>수집 결과</dt><dd>${implemented ? `${brand.records}건 저장 · 프레임·콜라보·이벤트 후보 ${brand.frameEvents}건` : "미수집 · 새 소식이 없다는 뜻이 아님"}</dd></div>
    <div><dt>제약</dt><dd>${escape(annotation?.limits ?? brand.reason)}</dd></div>
    <div><dt>${implemented ? "관측 시각" : "조사 기준"}</dt><dd>${escape(implemented ? observed ?? "저장된 관측 없음" : "2026-09-25 · 추출 가능성 검토")}</dd></div>
    ${diagnostic ? `<div><dt>최근 실행</dt><dd>${escape(diagnosticLabel(diagnostic))}${diagnostic.message ? ` · ${escape(diagnostic.message)}` : ""}${diagnostic.detailFailures ? ` · 상세 ${diagnostic.detailFailures}건 실패` : ""}</dd></div>${diagnostic.nextAttemptAt ? `<div><dt>재시도 이후</dt><dd>${escape(diagnostic.nextAttemptAt)}</dd></div>` : ""}` : ""}</dl>
    ${annotation?.steps ? `<h3>추출 절차</h3><ol>${annotation.steps.map((step) => `<li>${escape(step)}</li>`).join("")}</ol>` : ""}</div>
  </details>`;
}

function diagnosticLabel(diagnostic) {
  if (!diagnostic) return "기록 없음";
  if (diagnostic.status === "deferred") return "재시도 대기";
  if (diagnostic.status === "partial" || Number(diagnostic.detailFailures ?? 0) > 0) return "일부 실패";
  return { ok: "정상 추출", cached: "저장본 사용", error: "실패" }[diagnostic.status] ?? diagnostic.status;
}

function operationRow(brand, diagnostics) {
  const page = selectedPages.find((entry) => entry.brandId === brand.brandId);
  const instagram = page?.parser === "instagram-public";
  const diagnostic = diagnostics.find((entry) => entry.sourceKey === page?.key);
  return `<tr><td>${escape(brand.brand)}</td><td>${instagram ? "공개 브라우저" : "웹 HTML"}</td><td>${escape(diagnosticLabel(diagnostic))}</td><td>${instagram ? "조건부 · 접근 제한에 취약" : "구조 변경 감시 필요"}</td><td>${instagram ? "최대 12개 · 공동 게시물 일부 제외" : page?.parser === "harufilm-news" ? "첫 목록 100개" : "첫 목록 12개"}</td></tr>`;
}

function resultRow(brand, rows) {
  const selected = rows.filter((row) => row.brand.id === brand.brandId);
  const dates = selected.map((row) => row.publishedOn).filter(Boolean).sort();
  const stored = selected.length > 0;
  return `<tr><td><a href="#method-${escape(brand.brandId)}">${escape(brand.brand)}</a></td><td>${stored ? "저장됨" : "미수집"}</td><td>${stored ? brand.records : "—"}</td><td>${stored ? brand.frameEvents : "—"}</td><td>${stored ? selected.filter((row) => !row.period.endsOn).length : "—"}</td><td>${stored ? selected.filter((row) => row.status.reportedEnded).length : "—"}</td><td>${dates.length ? `${escape(dates[0])} ~ ${escape(dates.at(-1))}` : stored ? "미표기" : "—"}</td></tr>`;
}

export function renderHtmlReport(dataset, quality) {
  const activeSourceKeys = new Set(selectedPages.map((page) => page.key));
  const rows = dataset.records.filter((row) => selectedBrandIds.includes(row.brand.id) && activeSourceKeys.has(row.source.key));
  const isFrameEvent = (row) => row.relevance === "frame-event" || (!row.relevance && ["frame", "collaboration", "event"].includes(row.classification.primary));
  const frameEvents = rows.filter(isFrameEvent);
  const missingEndDates = frameEvents.filter((row) => !row.period.endsOn).length;
  const brands = selectedBrands.map((brand) => ({ ...brand,
    ...quality.byBrand.find((entry) => entry.brandId === brand.brandId), sourceStatus: brand.status,
    records: rows.filter((row) => row.brand.id === brand.brandId).length,
    frameEvents: frameEvents.filter((row) => row.brand.id === brand.brandId).length,
  }));
  // A bounded preview, plus the complete stored dataset below it. Never invent examples.
  const previews = selectedBrandIds.flatMap((id) => rows.filter((row) => row.brand.id === id).slice(0, 2));
  const observedDays = rows.map((row) => row.source.observedAt?.slice(0, 10)).filter(Boolean).sort();
  const groups = brands.filter((brand) => brand.records > 0);
  const unpublished = brands.filter((brand) => brand.records === 0);
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; script-src 'sha256-${imageFallbackHash}'; base-uri 'none'; form-action 'none'">
<meta name="description" content="포토이즘·포토그레이·인생네컷·포토시그니처·하루필름·돈룩업의 프레임·콜라보 소식 수집 방법과 결과.">
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%23176452'/%3E%3Cpath d='M9 24V8l14 16V8' fill='none' stroke='white' stroke-width='3' stroke-linejoin='round'/%3E%3C/svg%3E">
<title>NEKI · 브랜드 소식 수집 결과</title>
<style>
:root{color-scheme:light dark;--bg:#f5f7f7;--paper:#fff;--ink:#172424;--muted:#576969;--line:#dbe3e2;--accent:#176452;--tint:#e8f3ef}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,-apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;line-height:1.6}main{max-width:1160px;margin:auto;padding:44px 28px 64px}a{color:inherit;text-underline-offset:4px}a:hover{color:var(--accent)}a:focus-visible,summary:focus-visible{outline:3px solid var(--accent);outline-offset:4px}header{border-bottom:1px solid var(--line);padding-bottom:24px}.wordmark{color:var(--accent);letter-spacing:.16em;font-size:12px;font-weight:700}h1{font-size:clamp(26px,4vw,38px);letter-spacing:-.06em;line-height:1.3;margin:10px 0 12px}h2{font-size:21px;letter-spacing:-.03em;margin:32px 0 16px}p{margin:8px 0;color:var(--muted)}.summary{display:flex;flex-wrap:wrap;gap:10px 22px;margin-top:16px;font-size:14px}.summary strong{color:var(--ink);font-variant-numeric:tabular-nums}nav{display:flex;gap:12px 18px;flex-wrap:wrap;margin-top:20px;font-size:14px}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}.item{min-width:0;background:var(--paper);border:1px solid var(--line);border-radius:12px;overflow:hidden}.image{aspect-ratio:4/3;background:var(--tint);display:grid;place-items:center;overflow:hidden}.image img{width:100%;height:100%;object-fit:contain}.item-body{padding:18px}.meta{font-size:12px;color:var(--muted);display:flex;justify-content:space-between;gap:10px}h3{font-size:17px;line-height:1.5;letter-spacing:-.02em;margin:9px 0 15px;overflow-wrap:anywhere}h3 a{text-decoration:none}dl{font-size:13px;margin:0 0 12px}dl>div{display:grid;grid-template-columns:44px minmax(0,1fr);gap:8px;margin:5px 0}dt{color:var(--muted)}dd{margin:0;overflow-wrap:anywhere}.unverified,.ended{font-size:12px;color:var(--muted)}.ended{color:#954d30}.source-link{margin-top:14px;font-size:13px;color:var(--accent)}details{border-top:1px solid var(--line);padding:16px 0}summary{cursor:pointer;font-weight:600}.table-wrap{overflow-x:auto;margin-top:16px}table{border-collapse:collapse;width:100%;font-size:13px;min-width:680px}th,td{text-align:left;vertical-align:top;padding:11px 10px;border-bottom:1px solid var(--line)}th{color:var(--muted);font-weight:500}td:first-child{width:43%}th:nth-child(3),td:nth-child(3){white-space:nowrap}.coverage{display:flex;gap:8px;flex-wrap:wrap;color:var(--muted);font-size:13px}.coverage span{background:var(--paper);border:1px solid var(--line);padding:4px 9px;border-radius:5px}footer{border-top:1px solid var(--line);margin-top:30px;padding-top:16px;font-size:12px;color:var(--muted)}.empty{padding:18px;color:var(--muted)}
@media(max-width:780px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}main{padding:28px 20px}}@media(max-width:480px){.grid{grid-template-columns:1fr}main{padding:24px 16px}.image{aspect-ratio:4/3}}@media(prefers-color-scheme:dark){:root{--bg:#111918;--paper:#192322;--ink:#e7eeec;--muted:#a7b7b2;--line:#33423e;--accent:#a0d6bd;--tint:#233a31}.ended{color:#f3b797}}@media print{body{background:white;color:#172424}main{max-width:none;padding:0}details{display:block}.grid{grid-template-columns:repeat(3,minmax(0,1fr))}.item{break-inside:avoid}a{color:inherit}footer{color:#576969}}
.image{position:relative}.image img{position:absolute;inset:0}.image-fallback{max-width:80%;padding:10px;text-align:center;font-size:13px;color:var(--accent)}
.brand-list{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0}.brand-list a{display:flex;gap:12px;align-items:center;background:var(--paper);border:1px solid var(--line);border-radius:6px;padding:7px 10px;font-size:13px;text-decoration:none}.brand-list span,.method-status{color:var(--muted);font-size:12px;font-weight:400}.method-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:18px;align-items:start}.method{min-width:0;padding:14px 16px;background:var(--paper);border:1px solid var(--line);border-radius:8px}.method summary{display:flex;flex-wrap:wrap;justify-content:space-between;gap:6px 14px}.method summary::before{content:'+';color:var(--accent)}.method[open] summary::before{content:'−'}.method-body{margin-top:12px}.method-body .source-link{margin:0 0 12px}.method dl>div{grid-template-columns:64px minmax(0,1fr);margin:9px 0}.policy{margin-top:20px;border-left:3px solid var(--accent);padding:1px 16px}.policy h3{margin:12px 0 6px}.policy p{font-size:13px}.result-table td:first-child{width:auto}.result-table{font-variant-numeric:tabular-nums}section{scroll-margin-top:20px}#results>p,#methods>p,#targets>p{font-size:14px}@media(max-width:780px){.method-grid{grid-template-columns:1fr}}@media print{.method-grid{grid-template-columns:1fr}.method{break-inside:avoid}}
.method-body ol{padding-left:22px;font-size:14px;line-height:1.7}.method-body li{margin:10px 0}.method dl{font-size:14px}.method h3{font-size:15px}.policy p{font-size:14px}.post-list details p{font-size:14px;overflow-wrap:anywhere}.post-list details{padding:10px 0}.method dl>div{grid-template-columns:72px minmax(0,1fr)}
</style></head><body><main>
<header><div class="wordmark">NEKI / COLLECTED STORIES</div><h1>브랜드 소식 수집 결과</h1>
<p>원문 게시물 기준 · 촬영 가능 여부 미확인</p>
<div class="summary"><span>저장된 관측일 <strong>${escape(observedDays.at(-1) ?? "미확인")}</strong></span><span>전체 <strong>${rows.length}건</strong></span><span>프레임·콜라보·이벤트 후보 <strong>${frameEvents.length}건</strong></span></div>
<nav aria-label="보고서 섹션"><a href="#targets">수집 대상 브랜드</a><a href="#methods">브랜드별 수집 방법</a><a href="#operations">자동 운영 검토</a><a href="#results">수집 결과</a><a href="#all-title">전체 게시물</a></nav></header>
<section id="targets" aria-labelledby="targets-title"><h2 id="targets-title">수집 대상 브랜드</h2>
<p>대상 ${brands.length}개 · 저장 결과 있음 ${groups.length}개 · 미수집 ${unpublished.length}개</p>
<div class="brand-list">${brands.map((brand) => `<a href="#method-${escape(brand.brandId)}">${escape(brand.brand)}<span>${brand.records > 0 ? `${brand.records}건` : "미수집"}</span></a>`).join("")}</div></section>
<section id="methods" aria-labelledby="methods-title"><h2 id="methods-title">브랜드별 수집 방법</h2>
<p>공식 웹 HTML ${selectedPages.filter((page) => page.parser !== "instagram-public").length}곳 · 공식 Instagram 공개 화면 ${selectedPages.filter((page) => page.parser === "instagram-public").length}곳</p>
<div class="method-grid">${brands.map((brand) => methodCard(brand, rows, quality.diagnostics)).join("")}</div>
<div class="policy"><h3>공통 수집·저장 방식</h3><p>공식 출처 확인 → HTML 또는 공개 렌더링 → 원문 ID·제목·날짜·이미지 주소 추출 → 정규화·분류 → 게시물 ID로 중복 제거·변경 감지 → JSON 누적 저장</p><p>웹 목록은 정상 응답 기준 출처당 GET 1회다. SNS는 프로필 1회와 최대 12개 상세 이동을 순차 실행하며 각 이동 전 2초를 기다린다. 브라우저의 부수 네트워크 요청은 이 이동 횟수에 포함되지 않는다.</p><p>state.json은 누적 원문과 마지막 성공·재시도 시각을 보존한다. 브랜드 ID + 출처 key + 원문 ID가 고유키이며 SHA-256이 달라진 글은 재검토 대상으로 바뀐다. Instagram 이미지의 서명만 바뀌면 URL만 갱신한다. 사라진 글은 삭제하지 않고 기존 관측일을 유지한다.</p><p>실행별 normalized.json, frame-events.json, review-queue.json, quarantine.json, quality.json, run.json, manifest.json을 만든다. 필수값·출처 오류는 격리하고 누락된 날짜는 null로 남긴다. 분류는 제목·출처 카테고리 근거와 본문 힌트를 구분한다.</p><p>성공한 출처는 기본 6시간 재요청을 건너뛴다. 실패한 출처의 기존 데이터는 유지하고 유형별 대기 시간을 적용한다. 과거 전체 이력 수집·OCR은 하지 않았다. GitHub Actions 예약 수집·공유 데이터 브랜치·어드민 조회 탭은 코드로 구성했으며 머지 후 첫 실행과 운영 검증이 필요하다.</p><p>이 보고서는 저장본으로 생성한 정적 스냅샷이다. 링크를 열어도 수집기가 실행되지 않는다. 이미지 파일은 복제하지 않고 원문 URL을 참조한다. SNS 이미지 링크는 만료될 수 있으며 신규 공개 서비스 적용 전 자동 수집 정책과 이미지 사용 권한을 확인해야 한다.</p></div></section>
<section id="operations" aria-labelledby="operations-title"><h2 id="operations-title">자동 운영 검토</h2>
<p>6개 브랜드의 추출은 확인했다. 장기간 무인 반복 실행의 성공률·누락률은 아직 측정하지 않았다.</p>
<div class="table-wrap"><table class="result-table operation-table"><caption hidden>브랜드별 자동 운영 조건</caption><thead><tr><th scope="col">브랜드</th><th scope="col">경로</th><th scope="col">저장된 최근 실행</th><th scope="col">운영 조건</th><th scope="col">수집 범위</th></tr></thead><tbody>${brands.map((brand) => operationRow(brand, quality.diagnostics ?? [])).join("")}</tbody></table></div>
<div class="policy"><h3>구현한 보호 장치</h3><p>문서와 1차 도메인 XHR/fetch의 429·로그인 전환·인증 화면·401/403은 해당 출처를 중단한다. Instagram 상세 메타데이터가 3회 연속 실패하거나 출처당 120초 예산이 소진되면 더 이상 상세로 이동하지 않는다. 다른 출처의 수집은 계속한다.</p><p>요청 제한은 6시간, 로그인·인증·접근 거부는 12시간, 화면 구조 변경은 1시간, 그 외 부분 실패는 30분, 일반 오류는 15분부터 대기한다. 연속 실패마다 2배로 늘려 24시간까지 적용하고, 서버 Retry-After가 더 길면 그 시간을 지킨다. --force도 대기를 건너뛰지 않는다.</p><p>일부 글만 읽으면 부분 실패로 기록한다. 읽은 글은 저장하고 기존 글은 보존하며 전체 성공 시각을 갱신하지 않는다. 오류·부분 실패·재시도 대기는 종료 코드 1로 전달한다. 잠금으로 동시 실행을 막고 JSON을 임시 파일에 쓴 뒤 교체한다.</p><h3>실제 확인된 문제</h3><p>Instagram 이미지 6개의 서명 URL 만료, 포토그레이 상세 글 3개 실패, 인생네컷 메타데이터 형식 차이를 확인했다. 이미지 오류 시 원문 링크 표시, 부분 실패 판정, 메타데이터 파싱 보완을 반영했다. 저장된 과거 실행의 부분 실패는 정상으로 덮어쓰지 않는다.</p><h3>운영 전에 필요한 작업</h3><p>Node.js·Chrome 실행 환경과 같은 영속 상태 경로를 유지하고 예약 실행·실패 알림·백업을 연결해야 한다. 날짜별 반복 실행 결과로 성공률과 누락을 검증해야 한다. GitHub Actions 6시간 간격 예약과 15분 실행 제한을 구성했다. PR 머지 후 첫 실행이 필요하며 별도 알림 전송은 아직 연결하지 않았다.</p><p>최신 목록 밖으로 밀린 글·다른 계정 명의 공동 게시물은 놓칠 수 있다. 신규 ID·기한이 된 실패 게시물·24시간 지난 기존 게시물 순으로 조회한다. 실패 게시물 URL·단계·시도 횟수를 저장하고 3회 실패하면 수동 검토로 전환한다. 과거 전체 백필은 미구현이다. 과거 이미지 서명은 최신 12개 조회만으로 모두 갱신되지 않으며 영구 이미지 보관도 미구현이다. 원문 링크는 제공하지만 이미지 표시의 영속성을 보장하지 않는다.</p><p>공식 API 대안은 <a href="https://www.postman.com/meta/instagram/folder/u4g5a2a/instagram-api-with-facebook-login" target="_blank" rel="noopener noreferrer">Meta Instagram API with Facebook Login</a>의 Business Discovery다. 다른 비즈니스·크리에이터 계정의 공개 정보 조회 경로가 있지만 연결된 프로페셔널 계정과 권한이 필요하다. 대상 4개 계정의 API 조회 가능 여부와 실제 토큰 호출은 아직 검증하지 않았다.</p></div></section>
<section id="results" aria-labelledby="results-title"><h2 id="results-title">수집 결과</h2>
<div class="summary"><span>저장 게시물 <strong>${rows.length}건</strong></span><span>프레임·콜라보·이벤트 후보 <strong>${frameEvents.length}건</strong></span><span>후보 종료일 미확인 <strong>${missingEndDates}건</strong></span></div>
<div class="table-wrap"><table class="result-table"><caption hidden>브랜드별 저장 결과</caption><thead><tr><th scope="col">브랜드</th><th scope="col">수집 상태</th><th scope="col">저장 건수</th><th scope="col">프레임·이벤트 후보</th><th scope="col">종료일 미확인(전체)</th><th scope="col">원문 종료 표기</th><th scope="col">게시일 범위</th></tr></thead><tbody>${brands.map((brand) => resultRow(brand, rows)).join("")}</tbody></table></div>
<p>새로운 요청 없이 저장본을 집계했다. 후보 건수는 촬영 가능한 활성 프레임 수가 아니며, 기간·적용 부스는 별도 확인이 필요하다.</p></section>
<section aria-labelledby="preview-title"><h2 id="preview-title">수집한 항목</h2><div class="grid">${previews.length ? previews.map(card).join("") : '<div class="empty">수집된 항목 없음</div>'}</div></section>
<section aria-labelledby="all-title"><h2 id="all-title">브랜드별 전체 목록</h2>${groups.map((brand) => `<details class="post-list" id="${escape(brand.brandId)}"><summary>${escape(brand.brand)} · ${brand.records}건</summary><div class="table-wrap"><table><caption hidden>${escape(brand.brand)} 수집 게시물 전체</caption><thead><tr><th scope="col">제목</th><th scope="col">분류</th><th scope="col">게시일</th><th scope="col">기간</th><th scope="col">원문 상태</th></tr></thead><tbody>${rows.filter((row) => row.brand.id === brand.brandId).map(tableRow).join("")}</tbody></table></div></details>`).join("")}</section>
<footer>HTML 생성 ${escape(dataset.generatedAt)} · 저장 데이터로 작성 · 이미지는 원문 URL 참조 · 기간 미확인 후보 ${missingEndDates}건(종료일 기준)</footer>
</main><script>${imageFallbackScript}</script></body></html>`;
}
