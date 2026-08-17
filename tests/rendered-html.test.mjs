import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Neki Admin operations shell and loading state", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Neki Admin<\/title>/i);
  assert.match(html, /수동 알림/);
  assert.match(html, /부스 관리/);
  assert.match(html, /브랜드 관리/);
  assert.doesNotMatch(html, /브랜드 지원 관리/);
  assert.doesNotMatch(html, /미지원 브랜드 관리/);
  assert.match(html, /포즈 관리/);
  assert.match(html, /운영 데이터를 불러오고 있어요/);
  assert.doesNotMatch(html, /빠른 실행|운영 알림/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|Building your site/);
});

test("keeps the Neki design foundation and API adapter boundary explicit", async () => {
  const [page, adminApp, adapterEntry, apiAdapter, amplitudeRoute, dashboardRoute, mockAdapter, mockData, types, css, layout, packageJson, mockAnalytics] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/AdminApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/admin-adapter.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/api-admin-adapter.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/amplitude/metrics/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/amplitude/dashboard/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/mock-admin-adapter.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/mock-admin-data.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/types.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/mock-analytics-events.ts", import.meta.url), "utf8"),
  ]);
  const localStorageSource = await readFile(new URL("../app/admin/local-admin-storage.ts", import.meta.url), "utf8");

  assert.match(page, /AdminApp/);
  assert.match(adminApp, /from "antd"/);
  assert.match(adminApp, /colorPrimary:\s*"#f55243"/);
  assert.match(adminApp, /notifications: \{ title: "수동 알림" \}/);
  assert.match(adminApp, /예약 발송을 취소할까요/);
  assert.match(adminApp, /className="audience-radio-group"/);
  assert.match(adminApp, /\{ label: "특정 사용자", value: "selected" \}/);
  assert.match(adminApp, /placeholder="닉네임 검색"/);
  assert.match(adminApp, /type="text" size="small" disabled=\{!isDirty\} onClick=\{reset\}>초기화/);
  assert.match(adminApp, /draft\.delivery === "now" \? "보내기" : "예약하기"/);
  assert.doesNotMatch(adminApp, /발송 내용 확인|예약 내용 확인|choice-card/);
  assert.match(adminApp, /type NotificationTabKey = "compose" \| "scheduled" \| "history"/);
  assert.match(adminApp, /record\.status === "예약 대기"/);
  assert.match(adminApp, /record\.status === "발송 완료" \|\| record\.status === "발송 실패"/);
  assert.match(adminApp, /key: "scheduled"[\s\S]*key: "history"/);
  const storeScreen = adminApp.slice(adminApp.indexOf("function StoreScreen"), adminApp.indexOf("const toBrandDraft"));
  const storeColumns = storeScreen.slice(storeScreen.indexOf("const columns:"), storeScreen.indexOf("const closeRowSelection:"));
  assert.match(storeScreen, /const \[closeMode, setCloseMode\] = useState\(false\)/);
  assert.match(storeScreen, /const \[selectedStoreIds, setSelectedStoreIds\] = useState<string\[\]>\(\[\]\)/);
  assert.match(storeScreen, />폐점하기<\/Button>/);
  assert.match(storeScreen, /rowSelection=\{closeMode \? closeRowSelection : undefined\}/);
  assert.match(storeScreen, /const closeRowSelection:[\s\S]*selectedRowKeys: selectedStoreIds[\s\S]*getCheckboxProps:[\s\S]*record\.status !== "운영 중"/);
  assert.match(storeScreen, /adminAdapter\.closeStores\(selectedStores\.map\(\(store\) => store\.id\)\)/);
  assert.match(storeScreen, /선택한 \$\{selectedStores\.length\}개 부스를 폐점 처리할까요/);
  assert.match(storeScreen, /선택한 부스 폐점/);
  assert.doesNotMatch(storeColumns, /setCloseTarget|>폐점<\/Button>/);
  assert.doesNotMatch(storeScreen, /closeTarget|setCloseTarget|key="shutdown"/);
  assert.match(adminApp, /Android QR 지원/);
  assert.match(adminApp, /iOS QR 지원/);
  assert.match(adminApp, /brands: \{ title: "브랜드 관리" \}/);
  assert.match(adminApp, /key: "brands", label: "브랜드 관리"/);
  assert.match(adminApp, /dictionary: \{ title: "사전 관리" \}/);
  assert.match(adminApp, /key: "dictionary", label: "사전 관리"/);
  assert.match(adminApp, /analytics: \{ title: "Amplitude 지표" \}/);
  assert.match(adminApp, /key: "analytics", label: "Amplitude 지표"/);
  assert.match(adminApp, /function AnalyticsScreen/);
  assert.doesNotMatch(adminApp, /<span>\{record\.platform\} · \{record\.sourceFile\}<\/span>/);
  assert.match(adminApp, /<Title level=\{3\}>Amplitude 지표<\/Title>/);
  assert.doesNotMatch(adminApp, /GA4/);
  assert.doesNotMatch(adminApp, /이벤트명을 누르면 상세 정보를 볼 수 있습니다/);
  assert.match(adminApp, /ANALYTICS_REFRESH_COOLDOWN_MS = 30_000/);
  assert.match(adminApp, /cooldownRemaining > 0/);
  assert.match(adminApp, /선택 기간 발생/);
  assert.match(adminApp, /활성 사용자/);
  assert.match(adminApp, /일별/);
  assert.match(adminApp, /주별/);
  assert.match(adminApp, /월별/);
  assert.match(adapterEntry, /apiAdminAdapter/);
  assert.match(apiAdapter, /fetch\(`\/api\/amplitude\/metrics\?granularity=\$\{granularity\}`/);
  assert.match(apiAdapter, /fetch\(`\/api\/amplitude\/dashboard\?/);
  assert.match(dashboardRoute, /\/api\/2\/users/);
  assert.match(dashboardRoute, /m: "active"/);
  assert.match(dashboardRoute, /m: "new"/);
  assert.match(dashboardRoute, /AMPLITUDE_PROJECT_START_DATE/);
  assert.match(dashboardRoute, /g: "platform"/);
  assert.match(dashboardRoute, /rangeStartDate/);
  assert.match(dashboardRoute, /rangeEndDate/);
  assert.match(dashboardRoute, /METRICS_CACHE_TTL_MS = 60_000/);
  assert.match(dashboardRoute, /AMPLITUDE_REQUEST_CONCURRENCY = 1/);
  assert.match(dashboardRoute, /const amplitudeResponseCache/);
  assert.match(dashboardRoute, /const cachedAmplitudeRequest/);
  assert.match(dashboardRoute, /const queryConfigs = metricConfigs\.map\(\(config\) => \{[\s\S]*config\.key !== activeMetricKey[\s\S]*points: 1[\s\S]*granularity === "range"/);
  assert.match(apiAdapter, /const normalizeDashboardAnchor/);
  assert.match(apiAdapter, /query\.rangeStartDate && query\.rangeEndDate/);
  assert.doesNotMatch(dashboardRoute, /fallback|mockAdminAdapter/);
  assert.match(amplitudeRoute, /AMPLITUDE_API_KEY/);
  assert.match(amplitudeRoute, /\/api\/2\/taxonomy\/event/);
  assert.match(amplitudeRoute, /\/api\/2\/events\/segmentation/);
  assert.match(amplitudeRoute, /\/api\/2\/users/);
  assert.match(amplitudeRoute, /granularity/);
  assert.match(amplitudeRoute, /METRICS_CACHE_TTL_MS = 60_000/);
  assert.match(amplitudeRoute, /AMPLITUDE_REQUEST_CONCURRENCY = 4/);
  assert.match(amplitudeRoute, /event_type: "_all"/);
  assert.match(amplitudeRoute, /event_type_value/);
  assert.doesNotMatch(amplitudeRoute, /fetchPairedEventMetrics|amplitudeQueryEventName|withConcurrency|aggregateEventMetricsSupported/);
  assert.match(adminApp, /function QrParsingScreen/);
  assert.match(adminApp, /Android 파싱 로직/);
  assert.match(adminApp, /WebView 진입 즉시/);
  assert.match(adminApp, /onOpenQrParsing/);
  assert.match(adminApp, /view === "analytics" && <AnalyticsScreen events=\{data\.analyticsEvents\} metrics=\{analyticsMetrics\}/);
  assert.match(adminApp, /view === "qr-parsing" && <QrParsingScreen onBack=\{\(\) => navigate\("brands"\)\}/);
  assert.match(adminApp, /type BrandQrFilter = "supported" \| "unsupported"/);
  assert.match(adminApp, /type BrandMapFilter = "visible" \| "hidden"/);
  const brandScreen = adminApp.slice(adminApp.indexOf("function BrandScreen"), adminApp.indexOf("const EMPTY_DICTIONARY_DRAFT"));
  const dictionaryScreen = adminApp.slice(adminApp.indexOf("function DictionaryScreen"), adminApp.indexOf("type PoseFilter"));
  const poseScreen = adminApp.slice(adminApp.indexOf("function PoseScreen"), adminApp.indexOf("function AdminWorkspace"));
  assert.equal(brandScreen.match(/<Checkbox\.Group\b/g)?.length, 2);
  assert.match(brandScreen, /<Checkbox\.Group<BrandQrFilter>[\s\S]*name="brand-qr-filter"[\s\S]*value=\{qrFilters\}[\s\S]*aria-label="QR 지원 필터"/);
  assert.match(brandScreen, /<Checkbox\.Group<BrandMapFilter>[\s\S]*name="brand-map-filter"[\s\S]*value=\{mapFilters\}[\s\S]*aria-label="지도 표시 필터"/);
  assert.match(brandScreen, /const qrSupported = brand\.androidQrSupported \|\| brand\.iosQrSupported/);
  assert.match(brandScreen, /const matchesQr = qrFilters\.length === 0[\s\S]*qrFilters\.includes\("supported"\) && qrSupported[\s\S]*qrFilters\.includes\("unsupported"\) && !qrSupported/);
  assert.match(brandScreen, /const matchesMap = mapFilters\.length === 0[\s\S]*mapFilters\.includes\("visible"\) && brand\.mapVisible[\s\S]*mapFilters\.includes\("hidden"\) && !brand\.mapVisible/);
  assert.match(brandScreen, /return matchesQuery && matchesQr && matchesMap/);
  assert.match(brandScreen, /const brandFiltersActive = Boolean\(qrFilters\.length \|\| mapFilters\.length\)/);
  assert.match(brandScreen, /const filtersActive = Boolean\(query \|\| brandFiltersActive\)/);
  assert.match(brandScreen, /const resetBrandFilters = \(\) => \{ setQrFilters\(\[\]\); setMapFilters\(\[\]\); setPage\(1\); \}/);
  assert.match(brandScreen, /const resetAllFilters = \(\) => \{ setQuery\(""\); resetBrandFilters\(\); \}/);
  assert.match(brandScreen, /normalizeDictionaryTerm\(term\)\.includes\(normalizedQuery\)/);
  assert.doesNotMatch(brandScreen, /<Segmented|BrandFilterMode|filterMode|setFilterMode|brand-view-filter|Grid\.useBreakpoint|<Select\b|supportStatus|qrOnly|mapOnly/);
  assert.doesNotMatch(adminApp, /빠른 실행|운영 알림|commandOpen|commandQuery|commandItems/);
  assert.match(brandScreen, /icon=\{<PlusOutlined \/>\}[\s\S]*onClick=\{openCreate\}>브랜드 추가/);
  assert.match(brandScreen, /setEditing\("new"\)[\s\S]*setDraft\(\{ \.\.\.EMPTY_BRAND_DRAFT \}\)/);
  assert.match(brandScreen, /adminAdapter\.saveBrand\(draft, creating \? undefined : editing\.id\)/);
  assert.match(brandScreen, /creating \? \[record, \.\.\.current\] : current\.map/);
  assert.doesNotMatch(adminApp, /API 연동 단계|프로토타입에서는|목 데이터가 초기화|참고 화면의|운영 시스템 정상|발송 전 체크리스트|Discord 운영 기록|두 지원 항목은 서로 독립적/);
  assert.match(brandScreen, /editing === "new" \? "브랜드 추가" : "브랜드 정보 수정"/);
  assert.match(brandScreen, /value: "supported" as const/);
  assert.match(brandScreen, /value: "unsupported" as const/);
  assert.match(brandScreen, /value: "visible" as const/);
  assert.match(brandScreen, /value: "hidden" as const/);
  assert.match(adminApp, /function BrandBooleanMark[\s\S]*value \? "O" : "X"/);
  assert.match(brandScreen, /title: "Android QR"[\s\S]*<BrandBooleanMark value=\{record\.androidQrSupported\}/);
  assert.match(brandScreen, /title: "iOS QR"[\s\S]*<BrandBooleanMark value=\{record\.iosQrSupported\}/);
  assert.match(brandScreen, /title: "지도 표시"[\s\S]*<BrandBooleanMark value=\{record\.mapVisible\}/);
  assert.match(brandScreen, /checkedChildren="O" unCheckedChildren="X" aria-label="Android QR 지원 여부"/);
  assert.match(brandScreen, /checkedChildren="O" unCheckedChildren="X" aria-label="iOS QR 지원 여부"/);
  assert.match(brandScreen, /checkedChildren="O" unCheckedChildren="X" aria-label="지도 표시 여부"/);
  assert.match(brandScreen, /icon=\{<ReloadOutlined \/>\}[\s\S]*className=\{`brand-filter-reset \$\{brandFiltersActive \? "" : "is-placeholder"\}`\}[\s\S]*disabled=\{!brandFiltersActive\}[\s\S]*>초기화<\/Button>/);
  assert.match(adminApp, /포즈 업로드/);
  assert.match(adminApp, /포즈 인원수 필터/);
  assert.match(poseScreen, /<Segmented<PoseFilter>[\s\S]*name="pose-people-filter"/);
  assert.match(poseScreen, /value=\{filter\}/);
  assert.match(poseScreen, /options=\{filterItems\.map\(\(item\) => \(\{/);
  assert.match(poseScreen, /onChange=\{setFilter\}/);
  assert.doesNotMatch(poseScreen, /className="pose-filter-button"|aria-pressed=/);
  assert.match(adminApp, /import koKR from "antd\/locale\/ko_KR"/);
  assert.match(adminApp, /<ConfigProvider locale=\{koKR\} theme=\{\{/);
  const segmentedTheme = adminApp.slice(adminApp.indexOf("Segmented: {"), adminApp.indexOf("Table: {", adminApp.indexOf("Segmented: {")));
  for (const token of ["itemActiveBg", "itemColor", "itemHoverBg", "itemHoverColor", "itemSelectedBg", "itemSelectedColor", "trackBg", "trackPadding"]) {
    assert.match(segmentedTheme, new RegExp(`\\b${token}:`));
  }
  assert.doesNotMatch(adminApp, /BrandSupportStatus|supportSummary|support-tag|title: "지원 현황"/);
  assert.match(brandScreen, /title: "최근 수정일"[\s\S]*responsive: \["lg"\]/);
  assert.match(brandScreen, /pagination=\{\{ current: page, pageSize: 30, responsive: true, showLessItems: true, showSizeChanger: false,[\s\S]*onChange: setPage \}\}/);
  assert.match(storeScreen, /pageSize: 30/);
  assert.match(storeScreen, /aria-label="시·도 필터"/);
  assert.match(storeScreen, /aria-label="시·군·구 필터"/);
  assert.match(dictionaryScreen, /label="원 단어"/);
  assert.match(dictionaryScreen, /label="허용 단어"/);
  assert.match(dictionaryScreen, /placeholder="원 단어 또는 허용 단어 검색"/);
  assert.match(dictionaryScreen, /Input\.TextArea/);
  assert.match(dictionaryScreen, /adminAdapter\.saveDictionary\(\{ canonicalTerm, allowedTerms \}/);
  assert.match(dictionaryScreen, /pageSize: 30/);
  assert.doesNotMatch(dictionaryScreen, /검색 정규화|인샹네컷.*인생네컷으로 연결/);
  assert.match(types, /sido: string/);
  assert.match(types, /sigungu: string/);
  assert.match(types, /dictionaries: DictionaryRecord\[\]/);
  assert.match(types, /saveDictionary\(draft: DictionaryDraft/);
  assert.match(mockData, /sido: "서울특별시", sigungu: "강남구"/);
  assert.match(mockData, /canonicalTerm: "인생네컷"[\s\S]*인샹네컷/);
  assert.match(mockAdapter, /async saveDictionary\(draft: DictionaryDraft/);
  assert.match(adminApp, /from "\.\/admin-adapter"/);
  assert.match(adapterEntry, /AdminAdapter = apiAdminAdapter/);
  assert.match(mockAdapter, /Prototype records are stored per browser/);
  assert.match(mockAdapter, /ensureStateHydrated/);
  assert.match(localStorageSource, /neki-admin:prototype-snapshot:v1/);
  assert.match(localStorageSource, /indexedDB/);
  assert.match(mockData, /notification-240710-12/);
  assert.match(mockData, /nickname: "네컷요정"/);
  assert.match(mockAdapter, /async searchNotificationRecipients\(query: string\)/);
  assert.match(mockAdapter, /draft\.audience === "selected"/);
  assert.match(mockData, /store-12/);
  assert.match(mockData, /brand-12/);
  assert.match(mockData, /pose-4-a/);
  assert.match(types, /export interface AdminAdapter/);
  assert.match(types, /export type AnalyticsEventRecord/);
  assert.match(types, /analyticsEvents: AnalyticsEventRecord\[\]/);
  assert.match(types, /searchAddresses/);
  assert.match(types, /searchNotificationRecipients/);
  assert.match(types, /selectedRecipients: NotificationRecipient\[\]/);
  assert.match(types, /findSimilarStores/);
  assert.match(types, /closeStores\(ids: string\[\]\): Promise<StoreRecord\[\]>/);
  assert.match(types, /findSimilarBrands/);
  assert.match(types, /uploadPoses/);
  assert.match(mockAdapter, /async closeStores\(ids: string\[\]\): Promise<StoreRecord\[\]>/);
  assert.match(mockAdapter, /const targets = uniqueIds\.map[\s\S]*const records = targets\.map[\s\S]*state\.stores = state\.stores\.map/);
  assert.equal([...mockData.matchAll(/id: "notification-/g)].length, 12);
  assert.equal([...mockData.matchAll(/id: "store-/g)].length, 12);
  assert.equal([...mockData.matchAll(/id: "brand-/g)].length, 17);
  assert.equal([...mockData.matchAll(/id: "pose-/g)].length, 8);
  assert.equal([...mockAnalytics.matchAll(/event\("/g)].length, 31);
  assert.match(mockAnalytics, /platform: "Android", trigger/);
  assert.match(mockAnalytics, /export const mockQrParsingRules/);
  assert.match(mockAnalytics, /android-webview-photoism/);
  assert.match(mockAnalytics, /다운로드 안내 후 WebView/);
  assert.match(mockAnalytics, /android-download-photogray/);
  assert.match(mockAnalytics, /ios-native-aura/);
  const brandSupportRows = [...mockData.matchAll(/name: "([^"]+)", androidQrSupported: (true|false), iosQrSupported: (true|false), mapVisible: (true|false)/g)];
  const androidQrSupportedBrands = brandSupportRows
    .filter(([, , supported]) => supported === "true")
    .map(([, name]) => name);
  assert.deepEqual(androidQrSupportedBrands, ["인생네컷", "포토이즘", "포토그레이", "하루필름", "포토시그니처", "모노맨션"]);
  const iosQrSupportedBrands = brandSupportRows
    .filter(([, , , supported]) => supported === "true")
    .map(([, name]) => name);
  assert.deepEqual(iosQrSupportedBrands, ["인생네컷", "포토이즘", "포토그레이", "하루필름", "포토시그니처", "모노맨션", "아우라픽"]);
  const mapVisibleBrands = brandSupportRows
    .filter(([, , , , visible]) => visible === "true")
    .map(([, name]) => name);
  assert.deepEqual(
    new Set(mapVisibleBrands),
    new Set(["포토이즘", "인생네컷", "포토그레이", "포토시그니처", "하루필름", "플랜비 스튜디오", "돈룩업", "모노맨션", "포토랩플러스", "픽닷", "비룸 스튜디오"]),
  );
  assert.doesNotMatch(adminApp, /mock-admin-adapter/);
  assert.doesNotMatch(adminApp, /ADDRESS_OPTIONS/);
  assert.doesNotMatch(mockAdapter, /fetch\(|axios|XMLHttpRequest/);
  assert.match(css, /--primary-400:\s*#f55243/);
  assert.match(css, /--radius-lg:\s*16px/);
  assert.match(css, /Pretendard/);
  assert.match(css, /\.brand-filter-heading \{[^}]*min-height: 32px/);
  assert.match(css, /\.brand-filter-reset\.is-placeholder \{ visibility: hidden; \}/);
  assert.match(css, /\.brand-filter-row \{[^}]*grid-template-columns: 96px minmax\(0, 1fr\)/);
  assert.match(css, /\.brand-boolean-mark\.is-yes/);
  assert.match(css, /\.brand-boolean-mark\.is-no/);
  assert.match(css, /\.store-selection-bar \{[^}]*min-height: 52px/);
  assert.match(css, /\.pose-filter-segmented \{[^}]*min-width: 540px/);
  assert.match(css, /\.analytics-intro-card/);
  assert.match(css, /\.analytics-summary-grid/);
  assert.match(css, /\.qr-parsing-card/);
  assert.doesNotMatch(css, /\.brand-filter-segmented\b|\.brand-filter-segment-item\b|\.brand-filter-options\b|\.brand-filter-option\b|\.pose-filter-button\b/);
  assert.doesNotMatch(css, /\.command-(?:trigger|modal|list)\b|\.shortcut\b/);
  assert.match(layout, /images:\s*\["\/og\.png"\]/);
  assert.match(packageJson, /"antd":/);
  assert.match(packageJson, /"@ant-design\/icons":/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);

  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
  await access(new URL("public/og.png", templateRoot));
  await access(new URL("public/poses/pose-1-a.jpg", templateRoot));
  await access(new URL("public/poses/pose-4-b.jpg", templateRoot));
});

test("keeps dashboard metrics date-driven, platform-aware, and isolated behind the adapter", async () => {
  const [adminApp, types, mockAdapter, css] = await Promise.all([
    readFile(new URL("../app/admin/AdminApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/types.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/mock-admin-adapter.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  const dashboardStart = adminApp.indexOf("const DASHBOARD_PRESET_OPTIONS");
  const overviewStart = adminApp.indexOf("function OverviewScreen");
  const dashboardEnd = adminApp.indexOf("type NotificationScreenProps");
  assert.ok(dashboardStart >= 0 && overviewStart > dashboardStart && dashboardEnd > overviewStart);
  const dashboardCode = adminApp.slice(dashboardStart, dashboardEnd);
  const overviewScreen = adminApp.slice(overviewStart, dashboardEnd);

  assert.doesNotMatch(overviewScreen, /바로 시작할 작업|next-actions-card|action-list|사용자에게 알림 보내기|신규 부스 등록하기|브랜드 지원 상태 검토하기/);
  for (const metric of ["DAU", "WAU", "MAU"]) {
    assert.match(dashboardCode, new RegExp(`label: "${metric}"`));
  }
  assert.match(overviewScreen, /<strong>총 사용자<\/strong><small>Amplitude 신규 사용자 누적<\/small>/);
  assert.match(overviewScreen, /aria-label="활성 사용자와 총 사용자"/);

  assert.match(dashboardCode, /\{ label: "오늘", value: "day" \}[\s\S]*\{ label: "이번 주", value: "week" \}[\s\S]*\{ label: "이번 달", value: "month" \}/);
  assert.match(overviewScreen, /<Segmented<Exclude<DashboardGranularity, "range">>[\s\S]*name="dashboard-presets"[\s\S]*options=\{DASHBOARD_PRESET_OPTIONS\}[\s\S]*aria-label="조회 기간 프리셋"/);
  assert.match(overviewScreen, /<DatePicker\.RangePicker[\s\S]*value=\{customRange\}[\s\S]*format="YYYY\.MM\.DD"[\s\S]*placeholder=\{\["시작일", "종료일"\]\}[\s\S]*aria-label="조회 기간"/);
  assert.match(overviewScreen, /<Button size="small" disabled=\{isEarliestPeriod\} onClick=\{\(\) => movePeriod\(-1\)\}>이전<\/Button>/);
  assert.match(overviewScreen, /<Button size="small" disabled=\{isCurrentPeriod \|\| granularity === "range"\} onClick=\{\(\) => movePeriod\(1\)\}>다음<\/Button>/);
  assert.match(overviewScreen, /setCustomRange\(currentPresetRange\(value, currentDate\)\)/);

  assert.equal(overviewScreen.match(/<Checkbox\.Group\b/g)?.length, 1);
  assert.match(overviewScreen, /<Checkbox\.Group<DashboardUserSeries>[\s\S]*name="dashboard-platform-series"[\s\S]*value=\{visibleSeries\}[\s\S]*options=\{platformOptions\}[\s\S]*onChange=\{\(next\) => next\.length > 0 && setVisibleSeries\(next\)\}[\s\S]*aria-label="누적 사용자 표시 항목"/);
  assert.match(dashboardCode, /value: "total" as const[\s\S]*value: "android" as const[\s\S]*value: "ios" as const/);
  assert.match(dashboardCode, /visibleSeries\.length === 1 && visibleSeries\.includes\(option\.value\)/);
  assert.match(dashboardCode, /aria-label="플랫폼별 활성 사용자 추이"/);
  assert.match(dashboardCode, /visibleSeries\.map\(\(series\) => `\$\{DASHBOARD_SERIES_LABELS\[series\]\}/);
  assert.match(dashboardCode, /data-value=\{visibleSeries\.map/);
  assert.match(overviewScreen, /aria-label="플랫폼별 누적 사용자"[\s\S]*metrics\.totalUsers[\s\S]*metrics\.androidUsers[\s\S]*metrics\.iosUsers/);

  assert.match(overviewScreen, /const \[dashboardLoading, setDashboardLoading\] = useState\(true\)/);
  assert.match(overviewScreen, /const \[dashboardError, setDashboardError\] = useState\(false\)/);
  assert.match(overviewScreen, /const dashboardRequest = useRef\(0\)/);
  assert.match(overviewScreen, /const queryKey = `\$\{granularity\}:\$\{selectedPeriod\.start\.format\("YYYY-MM-DD"\)\}:\$\{selectedPeriod\.end\.startOf\("day"\)\.format\("YYYY-MM-DD"\)\}`/);
  assert.match(overviewScreen, /setMetrics\(result\);[\s\S]*setMetricsQueryKey\(queryKey\)/);
  assert.match(overviewScreen, /const hasCurrentMetrics = metricsQueryKey === queryKey/);
  assert.match(overviewScreen, /const dashboardPending = !dashboardError && \(dashboardLoading \|\| !hasCurrentMetrics\)/);
  assert.match(overviewScreen, /setDashboardLoading\(true\)[\s\S]*setDashboardError\(false\)[\s\S]*adminAdapter\.getDashboardMetrics\([\s\S]*catch[\s\S]*setDashboardError\(true\)[\s\S]*finally[\s\S]*setDashboardLoading\(false\)/);
  assert.match(dashboardCode, /사용자 지표를 불러오고 있어요/);
  assert.match(dashboardCode, /선택한 기간에 사용자 데이터가 없습니다/);
  assert.match(overviewScreen, /dashboardError && !hasCurrentMetrics[\s\S]*title="사용자 지표를 불러오지 못했습니다"[\s\S]*다시 불러오기/);
  assert.match(overviewScreen, /dashboard-error-card" role="alert" aria-live="assertive"/);
  assert.match(overviewScreen, /dashboardError && hasCurrentMetrics && metrics[\s\S]*새 기준의 사용자 지표를 불러오지 못했습니다[\s\S]*다시 시도/);
  assert.match(overviewScreen, /aria-busy=\{dashboardPending\}/);
  assert.match(adminApp, /view === "dashboard" \? <OverviewScreen mode=\{loadMode\} \/>/);
  assert.match(overviewScreen, /minDate=\{DASHBOARD_MIN_DATE\}/);
  assert.match(overviewScreen, /disabledDate=\{\(date\) => date\.startOf\("day"\)\.isBefore\(DASHBOARD_MIN_DATE, "day"\) \|\| date\.startOf\("day"\)\.isAfter\(currentDate, "day"\)\}/);
  assert.match(overviewScreen, /setGranularity\("range"\)/);
  assert.match(overviewScreen, /setCustomRange\(\[start, end\]\)/);
  assert.match(overviewScreen, /setAnchorDate\(end\)/);

  assert.match(types, /export type DashboardGranularity = "day" \| "week" \| "month" \| "range"/);
  assert.match(types, /export type DashboardMetricsQuery = \{[\s\S]*granularity: DashboardGranularity;[\s\S]*anchorDate: string;[\s\S]*rangeStartDate\?: string;[\s\S]*rangeEndDate\?: string;/);
  assert.match(types, /export type DashboardTrendPoint = \{[\s\S]*activeUsers: number;[\s\S]*totalUsers: number \| null;[\s\S]*androidUsers: number \| null;[\s\S]*iosUsers: number \| null;/);
  assert.match(types, /export type DashboardMetrics = \{[\s\S]*hasData: boolean;[\s\S]*dau: DashboardMetricValue;[\s\S]*wau: DashboardMetricValue;[\s\S]*mau: DashboardMetricValue;[\s\S]*trend: DashboardTrendPoint\[\];/);
  assert.match(types, /getDashboardMetrics\(query: DashboardMetricsQuery, mode\?: LoadMode\): Promise<DashboardMetrics>/);
  assert.match(mockAdapter, /async getDashboardMetrics\(query: DashboardMetricsQuery, mode: LoadMode = "success"\): Promise<DashboardMetrics>/);
  assert.match(mockAdapter, /mode === "error"[\s\S]*사용자 지표를 불러오지 못했습니다/);
  assert.match(mockAdapter, /mode === "empty"[\s\S]*hasData: false[\s\S]*trend: \[\]/);
  assert.match(mockAdapter, /const totalUsers = 6680 \+ \(offset \* 9\) \+ Math\.floor\(offset \/ 4\)/);
  assert.doesNotMatch(mockAdapter, /const totalUsers = androidUsers \+ iosUsers/);
  assert.match(mockAdapter, /const DASHBOARD_EPOCH = dayjs\("2023-01-01"\)/);
  assert.match(mockAdapter, /mode === "empty" \|\| safeAnchor\.isBefore\(DASHBOARD_EPOCH, "day"\)/);
  assert.match(mockAdapter, /dashboardTrendDates\(asOf, query\.granularity, requestedRangeStart\)[\s\S]*\.filter\(\(date\) => !date\.isBefore\(DASHBOARD_EPOCH, "day"\)\)/);
  assert.match(mockAdapter, /query\.granularity === "day" \|\| query\.granularity === "range" \? point\.dau : query\.granularity === "week" \? point\.wau : point\.mau/);
  assert.doesNotMatch(overviewScreen, /mockAdminAdapter|mock-admin-adapter/);

  assert.doesNotMatch(css, /\.next-actions-card\b|\.action-list\b/);
  assert.match(css, /\.dashboard-summary-grid \{[^}]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.dashboard-chart-grid \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 1240px\) \{[\s\S]*\.dashboard-chart-grid \{ grid-template-columns: 1fr; \}[\s\S]*\}/);
  assert.match(css, /@media \(max-width: 1120px\) \{[\s\S]*\.dashboard-summary-grid \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}[\s\S]*\}/);
  const mobileDashboardCss = css.slice(css.indexOf("@media (max-width: 680px)"), css.indexOf("@media (max-width: 520px)"));
  assert.match(mobileDashboardCss, /\.dashboard-date-toolbar \{ display: grid; grid-template-columns: 1fr; \}/);
  assert.match(mobileDashboardCss, /\.dashboard-date-toolbar > \.ant-segmented \.ant-segmented-group \{ display: grid; grid-template-columns: repeat\(3, 1fr\); \}/);
  assert.match(mobileDashboardCss, /\.dashboard-date-controls \{ grid-template-columns: auto minmax\(0, 1fr\) auto; \}/);
  assert.match(mobileDashboardCss, /\.dashboard-platform-heading \{ align-items: flex-start; flex-direction: column; \}/);
  assert.match(css, /@media \(max-width: 420px\) \{[\s\S]*\.dashboard-summary-grid \{ grid-template-columns: 1fr; \}/);
  assert.match(css, /\.dashboard-bar-column:focus-visible::after \{[^}]*content: attr\(data-value\)/);
  assert.match(css, /\.dashboard-bar \{[^}]*min-height: 0/);
  assert.match(dashboardCode, /point\.activeUsers === 0 \? 0 :/);
  assert.match(dashboardCode, /dashboardSeriesValue\(point, series\) === 0 \? 0 :/);
});

test("supports deterministic success, empty, and error fixtures", async () => {
  const [adminApp, adapter] = await Promise.all([
    readFile(new URL("../app/admin/AdminApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/mock-admin-adapter.ts", import.meta.url), "utf8"),
  ]);
  assert.match(adminApp, /stateParam === "empty" \|\| stateParam === "error"/);
  assert.match(adapter, /mode === "error"/);
  assert.match(adapter, /mode === "empty"/);
  assert.match(adapter, /poses: \[\]/);
  assert.match(adminApp, /운영 데이터를 불러오지 못했습니다/);
  assert.match(adminApp, /검색 조건에 맞는 부스가 없습니다/);
});
