"use client";

import {
  Alert,
  App,
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  ConfigProvider,
  DatePicker,
  Descriptions,
  Empty,
  Flex,
  Form,
  Image,
  Input,
  Layout,
  Menu,
  Modal,
  Radio,
  Result,
  Select,
  Segmented,
  Space,
  Spin,
  Statistic,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  type MenuProps,
  type TableProps,
} from "antd";
import koKR from "antd/locale/ko_KR";
import PlusOutlined from "@ant-design/icons/PlusOutlined";
import ReloadOutlined from "@ant-design/icons/ReloadOutlined";
import CodeOutlined from "@ant-design/icons/CodeOutlined";
import ArrowLeftOutlined from "@ant-design/icons/ArrowLeftOutlined";
import dayjs, { type Dayjs } from "dayjs";
import weekOfYear from "dayjs/plugin/weekOfYear";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminAdapter } from "./admin-adapter";
import type {
  AddressSuggestion,
  AdminSnapshot,
  BrandDraft,
  BrandRecord,
  DashboardGranularity,
  DashboardMetricValue,
  DashboardMetrics,
  DashboardTrendPoint,
  DictionaryDraft,
  DictionaryRecord,
  LoadMode,
  NotificationAudience,
  NotificationDraft,
  NotificationRecipient,
  NotificationRecord,
  PoseRecord,
  StoreDraft,
  StoreRecord,
  AnalyticsEventRecord,
  AnalyticsEventMetric,
  AnalyticsGranularity,
  AnalyticsRefreshResult,
  QrParsingRule,
} from "./types";
import { mockQrParsingRules } from "./mock-analytics-events";

const { Header, Content, Sider } = Layout;
const { Text, Title, Paragraph } = Typography;

dayjs.extend(weekOfYear);

type ViewKey = "dashboard" | "notifications" | "stores" | "brands" | "dictionary" | "poses" | "analytics" | "qr-parsing";

const EMPTY_SNAPSHOT: AdminSnapshot = { notifications: [], stores: [], brands: [], dictionaries: [], poses: [], analyticsEvents: [] };

const VIEW_META: Record<ViewKey, { title: string }> = {
  dashboard: { title: "사용자 지표" },
  notifications: { title: "수동 알림" },
  stores: { title: "부스 관리" },
  brands: { title: "브랜드 관리" },
  dictionary: { title: "사전 관리" },
  poses: { title: "포즈 관리" },
  analytics: { title: "지표" },
  "qr-parsing": { title: "QR 파싱 로직" },
};

const menuItems: MenuProps["items"] = [
  { key: "dashboard", label: "대시보드" },
  {
    type: "group",
    label: "운영",
    children: [
      { key: "notifications", label: "수동 알림" },
      { key: "stores", label: "부스 관리" },
      { key: "brands", label: "브랜드 관리" },
      { key: "dictionary", label: "사전 관리" },
      { key: "poses", label: "포즈 관리" },
      { key: "analytics", label: "지표" },
    ],
  },
];

const mobileNavItems: Array<{ key: ViewKey; label: string }> = [
  { key: "dashboard", label: "대시보드" },
  { key: "notifications", label: "수동 알림" },
  { key: "stores", label: "부스" },
  { key: "brands", label: "브랜드" },
  { key: "dictionary", label: "사전" },
  { key: "poses", label: "포즈" },
  { key: "analytics", label: "지표" },
];

const audienceLabel = (audience: NotificationAudience, recipients: NotificationRecipient[] = []) => {
  if (audience === "all") return "전체 동의 사용자";
  if (audience === "android") return "Android";
  if (audience === "ios") return "iOS";
  if (recipients.length === 0) return "특정 사용자";
  return recipients.length === 1 ? recipients[0].nickname : `${recipients[0].nickname} 외 ${recipients.length - 1}명`;
};

const deliveryLabel = (delivery: NotificationDraft["delivery"]) =>
  delivery === "now" ? "즉시 발송" : "예약 발송";

const formatSchedule = (value?: string) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(date);
};

type BrandQrFilter = "supported" | "unsupported";
type BrandMapFilter = "visible" | "hidden";

function BrandBooleanMark({ value, yesLabel, noLabel }: { value: boolean; yesLabel: string; noLabel: string }) {
  return <span className={`brand-boolean-mark ${value ? "is-yes" : "is-no"}`} aria-label={value ? yesLabel : noLabel}>{value ? "O" : "X"}</span>;
}

function PageHeader({ view, action }: { view: ViewKey; action?: React.ReactNode }) {
  const meta = VIEW_META[view];
  return (
    <section className="page-heading">
      <Title level={1}>{meta.title}</Title>
      {action}
    </section>
  );
}

function LoadingPanel({ label }: { label: string }) {
  return (
    <Card className="state-card" aria-live="polite">
      <Spin size="large" />
      <Title level={4}>{label}</Title>
      <Text type="secondary">잠시만 기다려 주세요.</Text>
    </Card>
  );
}

function ErrorPanel({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className="state-card">
      <Result
        status="error"
        title="운영 데이터를 불러오지 못했습니다"
        subTitle="일시적인 문제일 수 있습니다. 잠시 후 다시 시도해 주세요."
        extra={<Button type="primary" onClick={onRetry}>다시 불러오기</Button>}
      />
    </Card>
  );
}

const DASHBOARD_GRANULARITY_OPTIONS = [
  { label: "일별", value: "day" },
  { label: "주별", value: "week" },
  { label: "월별", value: "month" },
] satisfies Array<{ label: string; value: DashboardGranularity }>;

const DASHBOARD_MIN_DATE = dayjs("2024-01-01");

const DASHBOARD_METRIC_CARDS = [
  { key: "dau", label: "DAU", description: "기준일 활성 사용자" },
  { key: "wau", label: "WAU", description: "최근 7일 활성 사용자" },
  { key: "mau", label: "MAU", description: "최근 30일 활성 사용자" },
] as const;

type DashboardUserSeries = "total" | "android" | "ios";

const DASHBOARD_SERIES_LABELS: Record<DashboardUserSeries, string> = {
  total: "전체",
  android: "Android",
  ios: "iOS",
};

const dashboardPeriodRange = (anchor: Dayjs, granularity: DashboardGranularity) => {
  if (granularity === "week") return { start: anchor.startOf("week"), end: anchor.endOf("week") };
  if (granularity === "month") return { start: anchor.startOf("month"), end: anchor.endOf("month") };
  return { start: anchor.startOf("day"), end: anchor.endOf("day") };
};

const dashboardPeriodLabel = (anchor: Dayjs, granularity: DashboardGranularity) => {
  const { start, end } = dashboardPeriodRange(anchor, granularity);
  if (granularity === "day") return start.format("YYYY년 M월 D일");
  if (granularity === "month") return start.format("YYYY년 M월");
  return `${start.format("YYYY.MM.DD")} – ${end.format("YYYY.MM.DD")}`;
};

const dashboardMetricPeriodLabel = (metric?: DashboardMetricValue) => {
  if (!metric) return "—";
  const start = dayjs(metric.startDate);
  const end = dayjs(metric.endDate);
  if (start.isSame(end, "day")) return start.format("YYYY.MM.DD");
  return `${start.format("YYYY.MM.DD")} – ${end.format("MM.DD")}`;
};

const dashboardActiveMetric = (granularity: DashboardGranularity) =>
  granularity === "day" ? "DAU" : granularity === "week" ? "WAU" : "MAU";

function DashboardActivityChart({ points, metric }: { points: DashboardTrendPoint[]; metric: string }) {
  const maxValue = Math.max(...points.map((point) => point.activeUsers), 1);
  return (
    <div className="dashboard-chart-scroll">
      <div className="dashboard-bar-chart" role="list" aria-label={`${metric} 추이`}>
        {points.map((point) => (
          <Tooltip key={point.date} title={`${point.label} · ${point.activeUsers.toLocaleString("ko-KR")}명`}>
            <div
              className="dashboard-bar-column"
              role="listitem"
              tabIndex={0}
              data-value={`${point.activeUsers.toLocaleString("ko-KR")}명`}
              aria-label={`${point.label} ${metric} ${point.activeUsers.toLocaleString("ko-KR")}명`}
            >
              <div className="dashboard-bar-track">
                <span className="dashboard-bar dashboard-bar-active" style={{ height: point.activeUsers === 0 ? 0 : `${Math.max((point.activeUsers / maxValue) * 100, 4)}%` }} />
              </div>
              <span className="dashboard-axis-label">{point.label}</span>
            </div>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}

const dashboardSeriesValue = (point: DashboardTrendPoint, series: DashboardUserSeries) => {
  if (series === "android") return point.androidUsers;
  if (series === "ios") return point.iosUsers;
  return point.totalUsers;
};

function DashboardCumulativeChart({
  points,
  visibleSeries,
}: {
  points: DashboardTrendPoint[];
  visibleSeries: DashboardUserSeries[];
}) {
  const maxValue = Math.max(...points.flatMap((point) => visibleSeries.map((series) => dashboardSeriesValue(point, series))), 1);
  return (
    <div className="dashboard-chart-scroll">
      <div className="dashboard-bar-chart dashboard-bar-chart-grouped" role="list" aria-label="플랫폼별 누적 사용자 추이">
        {points.map((point) => (
          <Tooltip
            key={point.date}
            title={visibleSeries.map((series) => `${DASHBOARD_SERIES_LABELS[series]} ${dashboardSeriesValue(point, series).toLocaleString("ko-KR")}명`).join(" · ")}
          >
            <div
              className="dashboard-bar-column"
              role="listitem"
              tabIndex={0}
              data-value={visibleSeries.map((series) => `${DASHBOARD_SERIES_LABELS[series]} ${dashboardSeriesValue(point, series).toLocaleString("ko-KR")}명`).join(" · ")}
              aria-label={`${point.label} ${visibleSeries.map((series) => `${DASHBOARD_SERIES_LABELS[series]} ${dashboardSeriesValue(point, series).toLocaleString("ko-KR")}명`).join(", ")}`}
            >
              <div className="dashboard-bar-track dashboard-grouped-track">
                {visibleSeries.map((series) => (
                  <span
                    key={series}
                    className={`dashboard-bar dashboard-bar-${series}`}
                    style={{ height: dashboardSeriesValue(point, series) === 0 ? 0 : `${Math.max((dashboardSeriesValue(point, series) / maxValue) * 100, 4)}%` }}
                  />
                ))}
              </div>
              <span className="dashboard-axis-label">{point.label}</span>
            </div>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}

function DashboardChartState({ loading, empty }: { loading: boolean; empty: boolean }) {
  if (loading) {
    return <div className="dashboard-chart-state"><Spin /><Text type="secondary">사용자 지표를 불러오고 있어요</Text></div>;
  }
  if (empty) {
    return <div className="dashboard-chart-state"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="선택한 기간에 사용자 데이터가 없습니다" /></div>;
  }
  return null;
}

function OverviewScreen({ mode }: { mode: LoadMode }) {
  const [granularity, setGranularity] = useState<DashboardGranularity>("day");
  const [anchorDate, setAnchorDate] = useState(() => dayjs().startOf("day"));
  const [metrics, setMetrics] = useState<DashboardMetrics>();
  const [metricsQueryKey, setMetricsQueryKey] = useState("");
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState(false);
  const [visibleSeries, setVisibleSeries] = useState<DashboardUserSeries[]>(["total", "android", "ios"]);
  const dashboardRequest = useRef(0);
  const queryKey = `${granularity}:${anchorDate.format("YYYY-MM-DD")}`;

  const loadDashboardMetrics = useCallback(async () => {
    const request = ++dashboardRequest.current;
    setDashboardLoading(true);
    setDashboardError(false);
    try {
      const result = await adminAdapter.getDashboardMetrics({
        granularity,
        anchorDate: anchorDate.format("YYYY-MM-DD"),
      }, mode);
      if (request === dashboardRequest.current) {
        setMetrics(result);
        setMetricsQueryKey(queryKey);
      }
    } catch {
      if (request === dashboardRequest.current) setDashboardError(true);
    } finally {
      if (request === dashboardRequest.current) setDashboardLoading(false);
    }
  }, [anchorDate, granularity, mode, queryKey]);

  useEffect(() => {
    const dashboardLoad = window.setTimeout(() => void loadDashboardMetrics(), 0);
    return () => window.clearTimeout(dashboardLoad);
  }, [loadDashboardMetrics]);

  const currentDate = dayjs().startOf("day");
  const currentPeriod = dashboardPeriodRange(currentDate, granularity);
  const selectedPeriod = dashboardPeriodRange(anchorDate, granularity);
  const isCurrentPeriod = selectedPeriod.start.isSame(currentPeriod.start, "day");
  const earliestPeriod = dashboardPeriodRange(DASHBOARD_MIN_DATE, granularity);
  const isEarliestPeriod = selectedPeriod.start.isSame(earliestPeriod.start, "day");
  const activeMetric = dashboardActiveMetric(granularity);
  const hasCurrentMetrics = metricsQueryKey === queryKey;
  const hasData = Boolean(hasCurrentMetrics && metrics?.hasData);
  const hasTrendData = Boolean(hasData && metrics?.trend.length);
  const dashboardPending = !dashboardError && (dashboardLoading || !hasCurrentMetrics);
  const pickerMode: "date" | "week" | "month" = granularity === "day" ? "date" : granularity;

  const movePeriod = (direction: -1 | 1) => {
    const unit = granularity === "day" ? "day" : granularity;
    setAnchorDate((current) => {
      const next = current.add(direction, unit).startOf("day");
      if (next.isBefore(DASHBOARD_MIN_DATE, "day")) return DASHBOARD_MIN_DATE;
      return next.isAfter(currentDate, "day") ? currentDate : next;
    });
  };

  const quickPeriods = [
    { label: "오늘", granularity: "day" as const },
    { label: "이번 주", granularity: "week" as const },
    { label: "이번 달", granularity: "month" as const },
  ];

  const platformOptions = [
    { label: <span className="dashboard-series-label"><i className="series-total" />전체</span>, value: "total" as const },
    { label: <span className="dashboard-series-label"><i className="series-android" />Android</span>, value: "android" as const },
    { label: <span className="dashboard-series-label"><i className="series-ios" />iOS</span>, value: "ios" as const },
  ].map((option) => ({
    ...option,
    disabled: visibleSeries.length === 1 && visibleSeries.includes(option.value),
  }));

  return (
    <>
      <PageHeader view="dashboard" />

      <Card className="content-card dashboard-date-card" size="small">
        <div className="dashboard-date-toolbar">
          <Segmented<DashboardGranularity>
            name="dashboard-granularity"
            value={granularity}
            options={DASHBOARD_GRANULARITY_OPTIONS}
            onChange={setGranularity}
            aria-label="대시보드 조회 단위"
          />
          <div className="dashboard-date-controls">
            <Button size="small" disabled={isEarliestPeriod} onClick={() => movePeriod(-1)}>이전</Button>
            <DatePicker
              key={granularity}
              className="dashboard-date-picker"
              picker={pickerMode}
              value={anchorDate}
              allowClear={false}
              inputReadOnly
              minDate={DASHBOARD_MIN_DATE}
              format={granularity === "month" ? "YYYY년 M월" : granularity === "week" ? (date) => `${date.year()}년 ${date.week()}주` : "YYYY.MM.DD"}
              disabledDate={(date) => date.startOf("day").isBefore(DASHBOARD_MIN_DATE, "day") || date.startOf("day").isAfter(currentDate, "day")}
              onChange={(date) => {
                if (!date) return;
                const selected = date.startOf("day");
                setAnchorDate(selected.isAfter(currentDate, "day") ? currentDate : selected);
              }}
              aria-label="조회 기준 기간"
            />
            <Button size="small" disabled={isCurrentPeriod} onClick={() => movePeriod(1)}>다음</Button>
          </div>
          <div className="dashboard-quick-periods" aria-label="현재 기간으로 빠르게 이동">
            {quickPeriods.map((item) => {
              const selected = granularity === item.granularity && dashboardPeriodRange(anchorDate, item.granularity).start.isSame(dashboardPeriodRange(currentDate, item.granularity).start, "day");
              return (
                <Button
                  key={item.granularity}
                  size="small"
                  type={selected ? "default" : "text"}
                  className={selected ? "dashboard-quick-selected" : ""}
                  onClick={() => { setGranularity(item.granularity); setAnchorDate(currentDate); }}
                >
                  {item.label}
                </Button>
              );
            })}
          </div>
        </div>
        <div className="dashboard-period-summary" aria-live="polite">
          <Text strong>{dashboardPeriodLabel(anchorDate, granularity)}</Text>
          {isCurrentPeriod && granularity !== "day" && <Tag color="processing">집계 중</Tag>}
          {dashboardPending && <Spin size="small" />}
          <Text type="secondary">
            {hasCurrentMetrics && metrics && !dashboardLoading ? `${dayjs(metrics.asOfDate).format("YYYY.MM.DD")} 기준 · ${dayjs(metrics.updatedAt).format("HH:mm")} 갱신` : dashboardPending ? "지표 갱신 중" : "조회 기준을 준비하고 있어요"}
          </Text>
        </div>
      </Card>

      {dashboardError && !hasCurrentMetrics ? (
        <Card className="content-card dashboard-error-card" role="alert" aria-live="assertive">
          <Result
            status="error"
            title="사용자 지표를 불러오지 못했습니다"
            subTitle="잠시 후 다시 시도해 주세요."
            extra={<Button type="primary" onClick={() => void loadDashboardMetrics()}>다시 불러오기</Button>}
          />
        </Card>
      ) : (
        <>
          {dashboardError && hasCurrentMetrics && metrics && (
            <Alert className="dashboard-refresh-alert" type="error" showIcon title="새 기준의 사용자 지표를 불러오지 못했습니다" action={<Button size="small" onClick={() => void loadDashboardMetrics()}>다시 시도</Button>} />
          )}

          <section className="dashboard-summary-grid" aria-label="활성 사용자와 총 사용자">
            {DASHBOARD_METRIC_CARDS.map((item) => {
              const metric = metrics?.activeUsers[item.key];
              return (
                <Card key={item.key} size="small" className={`dashboard-stat-card ${activeMetric === item.label ? "dashboard-stat-active" : ""}`}>
                  <Statistic
                    title={<span className="dashboard-stat-title"><strong>{item.label}</strong><small>{item.description}</small></span>}
                    value={hasData ? metric?.value ?? 0 : "—"}
                    loading={dashboardPending && !hasCurrentMetrics}
                    groupSeparator=","
                  />
                  <Text type="secondary" className="dashboard-stat-period">{dashboardPending && !hasCurrentMetrics ? "불러오는 중" : hasData ? dashboardMetricPeriodLabel(metric) : "데이터 없음"}</Text>
                </Card>
              );
            })}
            <Card size="small" className="dashboard-stat-card dashboard-total-card">
              <Statistic
                title={<span className="dashboard-stat-title"><strong>총 사용자</strong><small>선택일 기준 누적</small></span>}
                value={hasData ? metrics?.totalUsers ?? 0 : "—"}
                loading={dashboardPending && !hasCurrentMetrics}
                groupSeparator=","
              />
              <Text type="secondary" className="dashboard-stat-period">{dashboardPending && !hasCurrentMetrics ? "불러오는 중" : hasData ? `${dayjs(metrics?.asOfDate).format("YYYY.MM.DD")}까지` : "데이터 없음"}</Text>
            </Card>
          </section>

          <section className="dashboard-chart-grid" aria-label="사용자 지표 추이" aria-busy={dashboardPending}>
            <Card className="content-card dashboard-chart-card">
              <div className="dashboard-chart-heading">
                <div><Title level={2}>활성 사용자 추이</Title><Text type="secondary">선택한 단위의 {activeMetric}</Text></div>
                <Tag>{activeMetric}</Tag>
              </div>
              {metrics && hasCurrentMetrics && hasTrendData ? <DashboardActivityChart points={metrics.trend} metric={activeMetric} /> : <DashboardChartState loading={dashboardPending} empty={!hasTrendData} />}
            </Card>

            <Card className="content-card dashboard-chart-card">
              <div className="dashboard-chart-heading dashboard-platform-heading">
                <div><Title level={2}>누적 사용자 추이</Title><Text type="secondary">전체 및 플랫폼별</Text></div>
                <Checkbox.Group<DashboardUserSeries>
                  name="dashboard-platform-series"
                  className="dashboard-platform-filter"
                  value={visibleSeries}
                  options={platformOptions}
                  onChange={(next) => next.length > 0 && setVisibleSeries(next)}
                  aria-label="누적 사용자 표시 항목"
                />
              </div>
              {metrics && hasCurrentMetrics && hasTrendData ? <DashboardCumulativeChart points={metrics.trend} visibleSeries={visibleSeries} /> : <DashboardChartState loading={dashboardPending} empty={!hasTrendData} />}
              {metrics && hasCurrentMetrics && hasData && (
                <div className="dashboard-platform-totals" aria-label="플랫폼별 누적 사용자">
                  <span><i className="series-total" /><small>전체</small><strong>{metrics.totalUsers.toLocaleString("ko-KR")}</strong></span>
                  <span><i className="series-android" /><small>Android</small><strong>{metrics.androidUsers.toLocaleString("ko-KR")}</strong></span>
                  <span><i className="series-ios" /><small>iOS</small><strong>{metrics.iosUsers.toLocaleString("ko-KR")}</strong></span>
                </div>
              )}
            </Card>
          </section>
        </>
      )}
    </>
  );
}

type NotificationScreenProps = {
  records: NotificationRecord[];
  setRecords: React.Dispatch<React.SetStateAction<NotificationRecord[]>>;
};

type NotificationTabKey = "compose" | "scheduled" | "history";
type NotificationListScope = Exclude<NotificationTabKey, "compose">;

const INITIAL_DRAFT: NotificationDraft = {
  title: "",
  content: "",
  destination: "",
  audience: "all",
  selectedRecipients: [],
  delivery: "now",
  scheduledAt: "",
};

function NotificationComposer({
  onCreated,
  onShowRecords,
}: {
  onCreated: (record: NotificationRecord) => void;
  onShowRecords: (tab: NotificationListScope) => void;
}) {
  const { message } = App.useApp();
  const [draft, setDraft] = useState<NotificationDraft>(INITIAL_DRAFT);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [expectedRecipients, setExpectedRecipients] = useState<number>();
  const [success, setSuccess] = useState<NotificationRecord>();
  const [recipientOptions, setRecipientOptions] = useState<NotificationRecipient[]>([]);
  const [recipientLoading, setRecipientLoading] = useState(false);
  const [recipientError, setRecipientError] = useState("");
  const recipientRequest = useRef(0);

  const recipientChoices = useMemo(() => {
    const choices = new Map<string, NotificationRecipient>();
    [...draft.selectedRecipients, ...recipientOptions].forEach((recipient) => choices.set(recipient.id, recipient));
    return [...choices.values()];
  }, [draft.selectedRecipients, recipientOptions]);

  const searchRecipients = useCallback(async (query: string) => {
    const request = ++recipientRequest.current;
    setRecipientLoading(true);
    setRecipientError("");
    try {
      const result = await adminAdapter.searchNotificationRecipients(query);
      if (request === recipientRequest.current) setRecipientOptions(result);
    } catch {
      if (request === recipientRequest.current) {
        setRecipientOptions([]);
        setRecipientError("사용자를 불러오지 못했습니다.");
      }
    } finally {
      if (request === recipientRequest.current) setRecipientLoading(false);
    }
  }, []);

  const isDirty = Boolean(
    draft.title || draft.content || draft.destination || draft.audience !== "all" ||
    draft.selectedRecipients.length || draft.delivery !== "now" || draft.scheduledAt,
  );

  const openConfirmation = async () => {
    if (!draft.title.trim() || !draft.content.trim()) {
      message.warning("알림 제목과 내용을 모두 입력해 주세요.");
      return;
    }
    if (draft.audience === "selected" && draft.selectedRecipients.length === 0) {
      message.warning("사용자를 1명 이상 선택해 주세요.");
      return;
    }
    if (draft.delivery === "scheduled" && !draft.scheduledAt) {
      message.warning("예약 발송 날짜와 시간을 입력해 주세요.");
      return;
    }
    setConfirmOpen(true);
    setEstimateLoading(true);
    try {
      setExpectedRecipients(await adminAdapter.estimateAudience(draft));
    } catch {
      message.error("예상 발송 인원을 확인하지 못했습니다.");
      setConfirmOpen(false);
    } finally {
      setEstimateLoading(false);
    }
  };

  const submit = async () => {
    if (expectedRecipients === undefined) return;
    setSubmitLoading(true);
    try {
      const record = await adminAdapter.sendNotification(draft, expectedRecipients);
      onCreated(record);
      setConfirmOpen(false);
      setSuccess(record);
    } catch {
      message.error("알림을 처리하지 못했습니다. 입력 내용은 그대로 유지됩니다.");
    } finally {
      setSubmitLoading(false);
    }
  };

  const reset = () => {
    recipientRequest.current += 1;
    setDraft(INITIAL_DRAFT);
    setRecipientOptions([]);
    setRecipientLoading(false);
    setRecipientError("");
    setExpectedRecipients(undefined);
    setSuccess(undefined);
  };

  return (
    <>
      <div className="composer-grid">
        <Card className="content-card form-card">
          <div className="card-heading">
            <Title level={3}>알림 작성</Title>
            <Button type="text" size="small" disabled={!isDirty} onClick={reset}>초기화</Button>
          </div>

          <Form layout="vertical" requiredMark={false}>
            <Form.Item label="알림 제목" required extra={`${draft.title.length}/50`}>
              <Input
                value={draft.title}
                maxLength={50}
                placeholder="예: 8월 네컷 챌린지가 시작됐어요"
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                aria-label="알림 제목"
              />
            </Form.Item>
            <Form.Item label="알림 내용" required extra={`${draft.content.length}/200`}>
              <Input.TextArea
                value={draft.content}
                maxLength={200}
                rows={5}
                placeholder="예: 이번 주말까지 8월 네컷 챌린지에 참여해 보세요."
                onChange={(event) => setDraft({ ...draft, content: event.target.value })}
                aria-label="알림 내용"
              />
            </Form.Item>
            <Form.Item label="클릭 시 이동 위치">
              <Input
                value={draft.destination}
                placeholder="예: /challenge/august 또는 https://..."
                onChange={(event) => setDraft({ ...draft, destination: event.target.value })}
                aria-label="클릭 시 이동 위치"
              />
            </Form.Item>

            <div className="form-section">
              <div className="form-section-heading">
                <Text strong>발송 대상</Text>
              </div>
              <Radio.Group
                className="audience-radio-group"
                value={draft.audience}
                onChange={(event) => {
                  const audience = event.target.value as NotificationAudience;
                  setDraft((current) => ({
                    ...current,
                    audience,
                    selectedRecipients: audience === "selected" ? current.selectedRecipients : [],
                  }));
                  if (audience === "selected" && recipientOptions.length === 0) void searchRecipients("");
                }}
                options={[
                  { label: "전체", value: "all" },
                  { label: "Android", value: "android" },
                  { label: "iOS", value: "ios" },
                  { label: "특정 사용자", value: "selected" },
                ]}
              />
            </div>

            {draft.audience === "selected" && (
              <Form.Item
                label="사용자 선택"
                required
                validateStatus={recipientError ? "error" : undefined}
                help={recipientError || undefined}
                extra={`${draft.selectedRecipients.length}명 선택`}
              >
                <Select
                  mode="multiple"
                  showSearch={{ filterOption: false, onSearch: searchRecipients }}
                  value={draft.selectedRecipients.map((recipient) => recipient.id)}
                  placeholder="닉네임 검색"
                  aria-label="닉네임으로 사용자 검색"
                  loading={recipientLoading}
                  maxTagCount="responsive"
                  maxTagTextLength={18}
                  onFocus={() => recipientOptions.length === 0 && void searchRecipients("")}
                  onChange={(ids: string[]) => setDraft((current) => ({
                    ...current,
                    selectedRecipients: ids
                      .map((id) => recipientChoices.find((recipient) => recipient.id === id))
                      .filter((recipient): recipient is NotificationRecipient => Boolean(recipient)),
                  }))}
                  notFoundContent={recipientLoading ? <Spin size="small" /> : "검색 결과가 없습니다."}
                  options={recipientChoices.map((recipient) => ({
                    value: recipient.id,
                    label: `${recipient.nickname} · ${recipient.handle} · ${recipient.platform}${recipient.canReceive ? "" : " · 수신 불가"}`,
                    disabled: !recipient.canReceive,
                  }))}
                />
              </Form.Item>
            )}

            <Form.Item label="발송 방식" required>
              <Radio.Group
                value={draft.delivery}
                onChange={(event) => setDraft({ ...draft, delivery: event.target.value })}
                optionType="button"
                buttonStyle="solid"
                options={[
                  { label: "즉시 발송", value: "now" },
                  { label: "예약 발송", value: "scheduled" },
                ]}
              />
            </Form.Item>
            {draft.delivery === "scheduled" && (
              <Form.Item label="예약 일시" required>
                <Input
                  type="datetime-local"
                  value={draft.scheduledAt}
                  onChange={(event) => setDraft({ ...draft, scheduledAt: event.target.value })}
                  aria-label="예약 일시"
                />
              </Form.Item>
            )}

            <Flex justify="flex-end" className="form-actions">
              <Button type="primary" onClick={openConfirmation}>
                {draft.delivery === "now" ? "보내기" : "예약하기"}
              </Button>
            </Flex>
          </Form>
        </Card>

      </div>

      <Modal
        open={confirmOpen}
        title={draft.delivery === "now" ? "알림을 보낼까요?" : "알림을 예약할까요?"}
        onCancel={() => !submitLoading && setConfirmOpen(false)}
        footer={[
          <Button key="cancel" disabled={submitLoading} onClick={() => setConfirmOpen(false)}>취소</Button>,
          <Button key="submit" type="primary" loading={submitLoading} disabled={estimateLoading || expectedRecipients === undefined} onClick={submit}>
            {draft.delivery === "now" ? "보내기" : "예약하기"}
          </Button>,
        ]}
      >
        {estimateLoading ? (
          <div className="modal-loading"><Spin /><Text>예상 발송 인원을 확인하고 있어요.</Text></div>
        ) : (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="제목">{draft.title}</Descriptions.Item>
            <Descriptions.Item label="내용">{draft.content}</Descriptions.Item>
            <Descriptions.Item label="이동 위치">{draft.destination || "입력하지 않음"}</Descriptions.Item>
            <Descriptions.Item label="발송 대상">{audienceLabel(draft.audience, draft.selectedRecipients)}</Descriptions.Item>
            {draft.audience === "selected" && (
              <Descriptions.Item label="선택 사용자">{draft.selectedRecipients.map((recipient) => recipient.nickname).join(", ")}</Descriptions.Item>
            )}
            <Descriptions.Item label="예상 인원"><strong>{expectedRecipients?.toLocaleString()}명</strong></Descriptions.Item>
            {draft.delivery === "scheduled" && <Descriptions.Item label="예약 일시">{formatSchedule(draft.scheduledAt)}</Descriptions.Item>}
          </Descriptions>
        )}
      </Modal>

      <Modal open={Boolean(success)} footer={null} closable={false} width={520}>
        {success && (
          <Result
            status="success"
            title={success.delivery === "now" ? "알림을 보냈습니다" : "알림을 예약했습니다"}
            subTitle={`${success.expectedRecipients.toLocaleString()}명에게 ${success.delivery === "now" ? "발송합니다." : `${formatSchedule(success.scheduledAt)}에 발송합니다.`}`}
            extra={[
              <Button key="new" onClick={reset}>새 알림 작성</Button>,
              <Button
                key="records"
                type="primary"
                onClick={() => {
                  setSuccess(undefined);
                  onShowRecords(success.delivery === "scheduled" ? "scheduled" : "history");
                }}
              >
                {success.delivery === "scheduled" ? "예약 중 보기" : "발송 이력 보기"}
              </Button>,
            ]}
          />
        )}
      </Modal>
    </>
  );
}

function NotificationHistory({ records, setRecords, onCompose, scope }: NotificationScreenProps & { onCompose: () => void; scope: NotificationListScope }) {
  const { message } = App.useApp();
  const [query, setQuery] = useState("");
  const [delivery, setDelivery] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [detail, setDetail] = useState<NotificationRecord>();
  const [cancelTarget, setCancelTarget] = useState<NotificationRecord>();
  const [cancelLoading, setCancelLoading] = useState(false);

  const scopedRecords = useMemo(() => {
    const result = records.filter((record) => scope === "scheduled"
      ? record.status === "예약 대기"
      : record.status === "발송 완료" || record.status === "발송 실패");
    if (scope === "scheduled") {
      return [...result].sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""));
    }
    return result;
  }, [records, scope]);

  const filtered = useMemo(
    () => scopedRecords.filter((record) =>
      record.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()) &&
      (delivery === "all" || record.delivery === delivery) &&
      (status === "all" || record.status === status)),
    [scopedRecords, query, delivery, status],
  );

  const cancelSchedule = async () => {
    if (!cancelTarget) return;
    setCancelLoading(true);
    try {
      const record = await adminAdapter.cancelNotification(cancelTarget.id);
      setRecords((current) => current.map((item) => item.id === record.id ? record : item));
      setDetail(undefined);
      setCancelTarget(undefined);
      message.success("예약 발송을 취소했습니다.");
    } catch {
      message.error("예약을 취소하지 못했습니다. 기존 예약 상태를 유지합니다.");
    } finally {
      setCancelLoading(false);
    }
  };

  const titleColumn: NonNullable<TableProps<NotificationRecord>["columns"]>[number] = {
    title: "알림",
    dataIndex: "title",
    render: (_, record) => (
      <button type="button" className="table-primary-link" onClick={() => setDetail(record)}>
        <strong>{record.title}</strong>
        <span>{record.destination || "이동 위치 없음"}</span>
      </button>
    ),
  };

  const scheduledColumns: TableProps<NotificationRecord>["columns"] = [
    titleColumn,
    { title: "발송 대상", width: 180, render: (_, record) => audienceLabel(record.audience, record.selectedRecipients) },
    { title: "예상 인원", width: 120, render: (_, record) => `${record.expectedRecipients.toLocaleString()}명` },
    { title: "예약 일시", width: 178, render: (_, record) => formatSchedule(record.scheduledAt) },
    {
      title: "작업",
      width: 150,
      render: (_, record) => (
        <Space size={4}>
          <Button type="link" size="small" onClick={() => setDetail(record)}>상세</Button>
          <Button type="link" danger size="small" onClick={() => setCancelTarget(record)}>예약 취소</Button>
        </Space>
      ),
    },
  ];

  const historyColumns: TableProps<NotificationRecord>["columns"] = [
    {
      ...titleColumn,
    },
    { title: "발송 대상", width: 180, render: (_, record) => audienceLabel(record.audience, record.selectedRecipients) },
    {
      title: "인원",
      width: 128,
      render: (_, record) => <span>{record.expectedRecipients.toLocaleString()} / {record.deliveredRecipients?.toLocaleString() ?? "—"}</span>,
    },
    { title: "방식", width: 100, render: (_, record) => deliveryLabel(record.delivery) },
    {
      title: "상태",
      dataIndex: "status",
      width: 112,
      render: (value: NotificationRecord["status"]) => <Tag className={`status-tag status-${value.replace(" ", "-")}`}>{value}</Tag>,
    },
    { title: "발송 일시", width: 168, render: (_, record) => record.sentAt ?? record.createdAt },
    {
      title: "작업",
      width: 150,
      render: (_, record) => (
        <Space size={4}>
          <Button type="link" size="small" onClick={() => setDetail(record)}>상세</Button>
        </Space>
      ),
    },
  ];

  const resetFilters = () => { setQuery(""); setDelivery("all"); setStatus("all"); };

  return (
    <>
      <Card className="content-card table-card">
        <div className={`toolbar notification-toolbar notification-toolbar-${scope}`}>
          <Input.Search value={query} onChange={(event) => setQuery(event.target.value)} placeholder="알림 제목 검색" aria-label="알림 제목 검색" allowClear />
          {scope === "history" && <Select aria-label="발송 방식 필터" value={delivery} onChange={setDelivery} options={[
            { label: "모든 발송 방식", value: "all" }, { label: "즉시 발송", value: "now" }, { label: "예약 발송", value: "scheduled" },
          ]} />}
          {scope === "history" && <Select aria-label="발송 상태 필터" value={status} onChange={setStatus} options={[
            { label: "모든 결과", value: "all" }, { label: "발송 완료", value: "발송 완료" }, { label: "발송 실패", value: "발송 실패" },
          ]} />}
          {(query || delivery !== "all" || status !== "all") && <Button onClick={resetFilters}>조건 초기화</Button>}
        </div>
        <div className="result-summary"><Text strong>{filtered.length}건</Text></div>
        {filtered.length ? (
          <Table
            rowKey="id"
            columns={scope === "scheduled" ? scheduledColumns : historyColumns}
            dataSource={filtered}
            scroll={{ x: scope === "scheduled" ? 760 : 980 }}
            pagination={{ pageSize: 5, showSizeChanger: false, showTotal: (total) => `총 ${total}건` }}
          />
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={scopedRecords.length
              ? "검색 조건에 맞는 알림이 없습니다."
              : scope === "scheduled" ? "예약 중인 알림이 없습니다." : "발송 이력이 없습니다."}
          >
            {scopedRecords.length ? <Button onClick={resetFilters}>검색 조건 초기화</Button> : <Button type="primary" onClick={onCompose}>새 알림 작성</Button>}
          </Empty>
        )}
      </Card>

      <Modal
        open={Boolean(detail)}
        title={scope === "scheduled" ? "예약 상세" : "발송 상세"}
        width={680}
        onCancel={() => setDetail(undefined)}
        footer={scope === "scheduled" && detail?.status === "예약 대기" ? [
          <Button key="close" onClick={() => setDetail(undefined)}>닫기</Button>,
          <Button key="cancel" danger onClick={() => setCancelTarget(detail)}>예약 취소</Button>,
        ] : <Button onClick={() => setDetail(undefined)}>닫기</Button>}
      >
        {detail && <Descriptions column={1} bordered size="small">
          <Descriptions.Item label="알림 제목">{detail.title}</Descriptions.Item>
          <Descriptions.Item label="알림 내용">{detail.content}</Descriptions.Item>
          <Descriptions.Item label="이동 위치">{detail.destination || "입력하지 않음"}</Descriptions.Item>
          <Descriptions.Item label="발송 대상">{audienceLabel(detail.audience, detail.selectedRecipients)}</Descriptions.Item>
          {detail.audience === "selected" && (
            <Descriptions.Item label="선택 사용자">{detail.selectedRecipients.map((recipient) => recipient.nickname).join(", ")}</Descriptions.Item>
          )}
          <Descriptions.Item label="예상 / 실제 인원">{detail.expectedRecipients.toLocaleString()}명 / {detail.deliveredRecipients?.toLocaleString() ?? "—"}명</Descriptions.Item>
          <Descriptions.Item label="발송 방식">{deliveryLabel(detail.delivery)}</Descriptions.Item>
          <Descriptions.Item label="현재 상태"><Tag className={`status-tag status-${detail.status.replace(" ", "-")}`}>{detail.status}</Tag></Descriptions.Item>
          <Descriptions.Item label="예약 일시">{formatSchedule(detail.scheduledAt)}</Descriptions.Item>
          <Descriptions.Item label="발송 일시">{detail.sentAt ?? "—"}</Descriptions.Item>
          {detail.failureReason && <Descriptions.Item label="실패 사유">{detail.failureReason}</Descriptions.Item>}
        </Descriptions>}
      </Modal>

      <Modal
        open={Boolean(cancelTarget)}
        title="예약 발송을 취소할까요?"
        okText="예약 취소"
        okButtonProps={{ danger: true, loading: cancelLoading }}
        cancelText="취소하지 않기"
        onOk={cancelSchedule}
        onCancel={() => !cancelLoading && setCancelTarget(undefined)}
      >
        {cancelTarget && <Descriptions column={1} size="small">
          <Descriptions.Item label="알림 제목">{cancelTarget.title}</Descriptions.Item>
          <Descriptions.Item label="발송 대상">{audienceLabel(cancelTarget.audience, cancelTarget.selectedRecipients)}</Descriptions.Item>
          <Descriptions.Item label="예상 인원">{cancelTarget.expectedRecipients.toLocaleString()}명</Descriptions.Item>
          <Descriptions.Item label="예약 일시">{formatSchedule(cancelTarget.scheduledAt)}</Descriptions.Item>
        </Descriptions>}
      </Modal>
    </>
  );
}

function NotificationScreen(props: NotificationScreenProps) {
  const [tab, setTab] = useState<NotificationTabKey>("compose");
  const scheduledCount = props.records.filter((record) => record.status === "예약 대기").length;
  const historyCount = props.records.filter((record) => record.status === "발송 완료" || record.status === "발송 실패").length;

  const addRecord = (record: NotificationRecord) => {
    props.setRecords((current) => [record, ...current.filter((item) => item.id !== record.id)]);
  };

  return (
    <>
      <PageHeader
        view="notifications"
        action={tab === "compose" ? undefined : <Button type="primary" onClick={() => setTab("compose")}>새 알림 작성</Button>}
      />
      <Tabs activeKey={tab} onChange={(key) => setTab(key as NotificationTabKey)} className="page-tabs" items={[
        { key: "compose", label: "알림 작성", children: <NotificationComposer onCreated={addRecord} onShowRecords={setTab} /> },
        { key: "scheduled", label: <span>예약 중 <Badge count={scheduledCount} showZero color="#e3e4e8" /></span>, children: <NotificationHistory {...props} scope="scheduled" onCompose={() => setTab("compose")} /> },
        { key: "history", label: <span>발송 이력 <Badge count={historyCount} showZero color="#e3e4e8" /></span>, children: <NotificationHistory {...props} scope="history" onCompose={() => setTab("compose")} /> },
      ]} />
    </>
  );
}

const EMPTY_STORE_DRAFT: StoreDraft = { brand: "", name: "", sido: "", sigungu: "", address: "", coordinates: "", phone: "" };

const parseAddressRegion = (address: string) => {
  const parts = address.trim().split(/\s+/).filter(Boolean);
  const sido = parts[0] === "서울" ? "서울특별시" : parts[0] ?? "";
  return { sido, sigungu: parts[1] ?? "" };
};

function StoreEditor({
  brands,
  initial,
  onCancel,
  onSaved,
}: {
  brands: BrandRecord[];
  initial?: StoreRecord;
  onCancel: (dirty: boolean) => void;
  onSaved: (record: StoreRecord) => void;
}) {
  const { message } = App.useApp();
  const [draft, setDraft] = useState<StoreDraft>(initial ? {
    brand: initial.brand, name: initial.name, sido: initial.sido, sigungu: initial.sigungu, address: initial.address, coordinates: initial.coordinates, phone: initial.phone,
  } : EMPTY_STORE_DRAFT);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addressQuery, setAddressQuery] = useState("");
  const [addressOptions, setAddressOptions] = useState<AddressSuggestion[]>(initial ? [{ id: `selected-${initial.id}`, address: initial.address, coordinates: initial.coordinates }] : []);
  const [addressSearching, setAddressSearching] = useState(false);
  const [similar, setSimilar] = useState<StoreRecord[]>([]);
  const original = initial ? JSON.stringify({ brand: initial.brand, name: initial.name, sido: initial.sido, sigungu: initial.sigungu, address: initial.address, coordinates: initial.coordinates, phone: initial.phone }) : JSON.stringify(EMPTY_STORE_DRAFT);
  const dirty = JSON.stringify(draft) !== original;

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const result = await adminAdapter.findSimilarStores(draft, initial?.id);
        if (active) setSimilar(result);
      } catch {
        if (active) setSimilar([]);
      }
    }, 220);
    return () => { active = false; window.clearTimeout(timer); };
  }, [draft, initial?.id]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      if (active) setAddressSearching(true);
      try {
        const result = await adminAdapter.searchAddresses(addressQuery);
        if (active) setAddressOptions(result);
      } catch {
        if (active) setAddressOptions([]);
      } finally {
        if (active) setAddressSearching(false);
      }
    }, 220);
    return () => { active = false; window.clearTimeout(timer); };
  }, [addressQuery]);

  const chooseAddress = (value: string) => {
    const address = addressOptions.find((item) => item.address === value);
    if (address) setDraft({ ...draft, ...parseAddressRegion(address.address), address: address.address, coordinates: address.coordinates });
  };

  const review = () => {
    if (!draft.brand || !draft.name.trim() || !draft.address || !draft.coordinates) {
      message.warning("브랜드, 부스명과 주소를 모두 입력해 주세요.");
      return;
    }
    setConfirmOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const record = await adminAdapter.saveStore(draft, initial?.id);
      onSaved(record);
      setConfirmOpen(false);
      message.success(initial ? "부스 정보를 수정했습니다." : "신규 부스를 등록했습니다.");
    } catch {
      message.error(`부스 ${initial ? "수정" : "등록"}에 실패했습니다. 입력 내용은 그대로 유지됩니다.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="editor-heading">
        <Button onClick={() => onCancel(dirty)}>목록으로</Button>
        <div><Text className="eyebrow">부스 관리</Text><Title level={2}>{initial ? "부스 정보 수정" : "신규 부스 등록"}</Title></div>
      </div>
      <Card className="content-card editor-card">
        <Form layout="vertical" requiredMark={false}>
          <div className="two-column-form">
            <Form.Item label="브랜드" required>
              <Select value={draft.brand || undefined} placeholder="기존 브랜드 선택" onChange={(brand) => setDraft({ ...draft, brand })} options={brands.map((brand) => ({ label: brand.name, value: brand.name }))} />
            </Form.Item>
            <Form.Item label="부스명" required>
              <Input value={draft.name} placeholder="예: 포토이즘 강남점" onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            </Form.Item>
          </div>
          {similar.length > 0 && <Alert type="warning" showIcon title="유사한 부스가 있습니다" description={`${similar.slice(0, 2).map((item) => `${item.name} (${item.address})`).join(", ")} · 중복 여부를 확인한 뒤에도 등록을 계속할 수 있습니다.`} />}
          <Form.Item label="주소 검색" required extra="검색 결과를 선택하면 위치 정보가 함께 입력됩니다.">
            <Select showSearch={{ filterOption: false, onSearch: setAddressQuery }} placeholder="도로명 또는 지번 주소 검색" value={draft.address || undefined} onChange={chooseAddress} options={addressOptions.map((item) => ({ label: item.address, value: item.address }))} loading={addressSearching} notFoundContent={addressSearching ? <Spin size="small" /> : "검색 결과가 없습니다."} />
          </Form.Item>
          <div className="two-column-form">
            <Form.Item label="위치 정보" required>
              <Input value={draft.coordinates} readOnly placeholder="주소 선택 후 자동 입력" />
            </Form.Item>
            <Form.Item label="연락처">
              <Input value={draft.phone} placeholder="예: 02-555-0147" onChange={(event) => setDraft({ ...draft, phone: event.target.value })} />
            </Form.Item>
          </div>
          <Alert type="info" showIcon title="운영 상태" description={initial ? `현재 상태는 ‘${initial.status}’입니다. 폐점 전환은 부스 목록의 선택 모드에서 진행합니다.` : "신규 부스는 ‘운영 중’ 상태로 등록됩니다."} />
          <Flex justify="flex-end" gap={8} className="form-actions">
            <Button onClick={() => onCancel(dirty)}>취소</Button>
            <Button type="primary" onClick={review}>{initial ? "변경 내용 저장" : "등록 내용 확인"}</Button>
          </Flex>
        </Form>
      </Card>
      <Modal open={confirmOpen} title={initial ? "변경 내용을 저장할까요?" : "신규 부스를 등록할까요?"} okText={initial ? "변경 저장" : "부스 등록"} cancelText="취소" confirmLoading={saving} onOk={save} onCancel={() => !saving && setConfirmOpen(false)}>
        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label="브랜드">{draft.brand}</Descriptions.Item>
          <Descriptions.Item label="부스명">{draft.name}</Descriptions.Item>
          <Descriptions.Item label="주소">{draft.address}</Descriptions.Item>
          <Descriptions.Item label="위치 정보">{draft.coordinates}</Descriptions.Item>
          <Descriptions.Item label="연락처">{draft.phone || "입력하지 않음"}</Descriptions.Item>
          <Descriptions.Item label="운영 상태">{initial?.status ?? "운영 중"}</Descriptions.Item>
        </Descriptions>
      </Modal>
    </>
  );
}

function StoreScreen({ stores, setStores, brands }: { stores: StoreRecord[]; setStores: React.Dispatch<React.SetStateAction<StoreRecord[]>>; brands: BrandRecord[] }) {
  const { message, modal } = App.useApp();
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState("all");
  const [status, setStatus] = useState("all");
  const [sido, setSido] = useState("all");
  const [sigungu, setSigungu] = useState("all");
  const [detail, setDetail] = useState<StoreRecord>();
  const [editor, setEditor] = useState<StoreRecord | "new">();
  const [closeMode, setCloseMode] = useState(false);
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [highlighted, setHighlighted] = useState<string>();
  const statusBeforeCloseMode = useRef("all");

  const sidoOptions = useMemo(() => ["all", ...new Set(stores.map((store) => store.sido).filter(Boolean))], [stores]);
  const sigunguOptions = useMemo(() => ["all", ...new Set(stores.filter((store) => sido === "all" || store.sido === sido).map((store) => store.sigungu).filter(Boolean))], [sido, stores]);
  const filtered = useMemo(() => stores.filter((store) => store.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()) && (brand === "all" || store.brand === brand) && (status === "all" || store.status === status) && (sido === "all" || store.sido === sido) && (sigungu === "all" || store.sigungu === sigungu)).sort((a, b) => a.name.localeCompare(b.name, "ko")), [stores, query, brand, status, sido, sigungu]);
  const selectedStores = useMemo(() => {
    const selected = new Set(selectedStoreIds);
    return stores.filter((store) => selected.has(store.id) && store.status === "운영 중");
  }, [selectedStoreIds, stores]);
  const activeStoreCount = stores.filter((store) => store.status === "운영 중").length;
  const clearSelection = () => setSelectedStoreIds([]);
  const resetFilters = () => {
    setQuery("");
    setBrand("all");
    setStatus(closeMode ? "운영 중" : "all");
    setSido("all");
    setSigungu("all");
    clearSelection();
  };
  const enterCloseMode = () => {
    statusBeforeCloseMode.current = status;
    setCloseMode(true);
    setStatus("운영 중");
    clearSelection();
  };
  const exitCloseMode = () => {
    setCloseMode(false);
    setStatus(statusBeforeCloseMode.current);
    setCloseConfirmOpen(false);
    clearSelection();
  };
  const closeEditor = (dirty: boolean) => {
    if (!dirty) { setEditor(undefined); return; }
    modal.confirm({ title: "저장하지 않고 나갈까요?", content: "변경한 부스 정보는 저장되지 않습니다.", okText: "나가기", cancelText: "계속 수정", onOk: () => setEditor(undefined) });
  };
  const saved = (record: StoreRecord) => {
    setStores((current) => current.some((item) => item.id === record.id) ? current.map((item) => item.id === record.id ? record : item) : [...current, record]);
    setHighlighted(record.id);
    setEditor(undefined);
  };
  const closeSelectedStores = async () => {
    if (!selectedStores.length) return;
    setClosing(true);
    try {
      const records = await adminAdapter.closeStores(selectedStores.map((store) => store.id));
      const updated = new Map(records.map((record) => [record.id, record]));
      setStores((current) => current.map((item) => updated.get(item.id) ?? item));
      setHighlighted(records.length === 1 ? records[0].id : undefined);
      exitCloseMode();
      message.success(`${records.length}개 부스를 폐점 상태로 변경했습니다.`);
    } catch {
      message.error("선택한 부스의 폐점 처리에 실패했습니다. 선택 상태를 유지합니다.");
    } finally { setClosing(false); }
  };

  if (editor) return <StoreEditor brands={brands} initial={editor === "new" ? undefined : editor} onCancel={closeEditor} onSaved={saved} />;

  const columns: TableProps<StoreRecord>["columns"] = [
    { title: "부스", render: (_, store) => closeMode ? <div className="table-primary-link table-primary-static"><strong>{store.name}</strong><span>{store.brand}</span></div> : <button type="button" className="table-primary-link" onClick={() => setDetail(store)}><strong>{store.name}</strong><span>{store.brand}</span></button> },
    { title: "운영 상태", dataIndex: "status", width: 110, render: (value) => <Tag color={value === "운영 중" ? "green" : "default"}>{value}</Tag> },
    { title: "주소", dataIndex: "address", ellipsis: true },
    { title: "최근 수정일", dataIndex: "updatedAt", width: 130 },
    ...closeMode ? [] : [{ title: "작업", width: 116, render: (_: unknown, store: StoreRecord) => <Space size={2}><Button type="link" size="small" onClick={() => setDetail(store)}>상세</Button><Button type="link" size="small" onClick={() => setEditor(store)}>수정</Button></Space> }],
  ];

  const closeRowSelection: TableProps<StoreRecord>["rowSelection"] = {
    selectedRowKeys: selectedStoreIds,
    columnWidth: 44,
    onChange: (keys) => setSelectedStoreIds(keys.map(String)),
    getCheckboxProps: (record) => ({
      disabled: closing || record.status !== "운영 중",
      "aria-label": `${record.name} 폐점 대상으로 선택`,
    }),
  };

  return (
    <>
      <PageHeader view="stores" action={closeMode
        ? <Button className="close-mode-exit" disabled={closing} onClick={exitCloseMode}>선택 모드 종료</Button>
        : <Space className="page-heading-actions" wrap><Button danger disabled={activeStoreCount === 0} onClick={enterCloseMode}>폐점하기</Button><Button type="primary" onClick={() => setEditor("new")}>신규 부스 등록</Button></Space>} />
      {highlighted && <Alert className="success-banner" type="success" showIcon closable={{ onClose: () => setHighlighted(undefined) }} title="변경한 부스를 목록에 반영했습니다." />}
      <Card className="content-card table-card">
        {closeMode && <div className="store-selection-bar">
          <div className="store-selection-copy"><Text strong>폐점할 부스를 선택하세요.</Text><Text type="secondary">운영 중인 부스만 표시합니다.</Text></div>
          <Space className="store-selection-actions" wrap size={8}>
            <Text type="secondary">{selectedStores.length}개 선택</Text>
            <Button size="small" disabled={selectedStores.length === 0 || closing} onClick={clearSelection}>선택 해제</Button>
            <Button type="primary" danger size="small" disabled={selectedStores.length === 0} loading={closing} onClick={() => setCloseConfirmOpen(true)}>선택한 부스 폐점</Button>
          </Space>
        </div>}
        <div className="toolbar">
          <Input.Search value={query} onChange={(event) => { setQuery(event.target.value); clearSelection(); }} placeholder="부스명 검색" allowClear aria-label="부스명 검색" />
          <Select value={brand} onChange={(value) => { setBrand(value); clearSelection(); }} aria-label="브랜드 필터" options={[{ label: "모든 브랜드", value: "all" }, ...brands.map((item) => ({ label: item.name, value: item.name }))]} />
          <Select value={status} disabled={closeMode} onChange={(value) => { setStatus(value); clearSelection(); }} aria-label="운영 상태 필터" options={[{ label: "모든 운영 상태", value: "all" }, { label: "운영 중", value: "운영 중" }, { label: "폐점", value: "폐점" }]} />
          {(query || brand !== "all" || (!closeMode && status !== "all") || sido !== "all" || sigungu !== "all") && <Button onClick={resetFilters}>조건 초기화</Button>}
        </div>
        <div className="store-region-filters" aria-label="행정구역 필터">
          <Text strong>지역</Text>
          <Select value={sido} onChange={(value) => { setSido(value); setSigungu("all"); clearSelection(); }} aria-label="시·도 필터" options={[{ label: "모든 시·도", value: "all" }, ...sidoOptions.filter((value) => value !== "all").map((value) => ({ label: value, value }))]} />
          <Select value={sigungu} disabled={sido === "all"} onChange={(value) => { setSigungu(value); clearSelection(); }} aria-label="시·군·구 필터" options={[{ label: sido === "all" ? "시·도 먼저 선택" : "모든 시·군·구", value: "all" }, ...sigunguOptions.filter((value) => value !== "all").map((value) => ({ label: value, value }))]} />
          <Text type="secondary">시·도를 선택하면 해당 시·군·구 목록이 좁혀집니다.</Text>
        </div>
        <div className="result-summary"><Text strong>{filtered.length}개 부스</Text></div>
        {filtered.length ? <Table rowKey="id" rowSelection={closeMode ? closeRowSelection : undefined} rowClassName={(record) => record.id === highlighted ? "highlight-row" : ""} columns={columns} dataSource={filtered} scroll={{ x: 860 }} pagination={{ pageSize: 30, showSizeChanger: false, showTotal: (total) => `총 ${total}개` }} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={stores.length ? "검색 조건에 맞는 부스가 없습니다." : "아직 등록된 부스가 없습니다."}>{stores.length ? <Button onClick={resetFilters}>검색 조건 초기화</Button> : <Button type="primary" onClick={() => setEditor("new")}>신규 부스 등록</Button>}</Empty>}
      </Card>

      <Modal open={Boolean(detail)} title="부스 상세" width={660} onCancel={() => setDetail(undefined)} footer={detail ? [<Button key="close" onClick={() => setDetail(undefined)}>닫기</Button>, <Button key="edit" onClick={() => { setEditor(detail); setDetail(undefined); }}>수정</Button>] : null}>
        {detail && <Descriptions column={1} bordered size="small"><Descriptions.Item label="브랜드">{detail.brand}</Descriptions.Item><Descriptions.Item label="부스명">{detail.name}</Descriptions.Item><Descriptions.Item label="주소">{detail.address}</Descriptions.Item><Descriptions.Item label="위치 정보">{detail.coordinates}</Descriptions.Item><Descriptions.Item label="연락처">{detail.phone || "등록되지 않음"}</Descriptions.Item><Descriptions.Item label="운영 상태"><Tag color={detail.status === "운영 중" ? "green" : "default"}>{detail.status}</Tag></Descriptions.Item><Descriptions.Item label="최근 수정일">{detail.updatedAt}</Descriptions.Item></Descriptions>}
      </Modal>
      <Modal open={closeConfirmOpen} title={`선택한 ${selectedStores.length}개 부스를 폐점 처리할까요?`} okText="선택한 부스 폐점" okButtonProps={{ danger: true, loading: closing, disabled: selectedStores.length === 0 }} cancelText="취소" cancelButtonProps={{ disabled: closing }} closable={!closing} keyboard={!closing} mask={{ closable: !closing }} onOk={closeSelectedStores} onCancel={() => !closing && setCloseConfirmOpen(false)}>
        <Paragraph>부스는 삭제되지 않으며, 폐점 상태로 목록에 계속 남습니다.</Paragraph>
        <ul className="store-close-list">{selectedStores.map((store) => <li key={store.id}><div><strong>{store.name}</strong><span>{store.brand}</span></div><Tag color="green">운영 중</Tag></li>)}</ul>
      </Modal>
    </>
  );
}

const ANALYTICS_AREAS = ["전체", "앱 공통", "아카이빙", "지도", "포즈", "마이페이지"] as const;
const ANALYTICS_GRANULARITY_OPTIONS: Array<{ label: string; value: AnalyticsGranularity }> = [
  { label: "일별", value: "day" },
  { label: "주별", value: "week" },
  { label: "월별", value: "month" },
];
const analyticsGranularityLabel = (value: AnalyticsGranularity) => ANALYTICS_GRANULARITY_OPTIONS.find((option) => option.value === value)?.label ?? "일별";

function AnalyticsScreen({ events, metrics, granularity, refreshing, refreshError, onRefresh, onGranularityChange }: { events: AnalyticsEventRecord[]; metrics?: AnalyticsRefreshResult; granularity: AnalyticsGranularity; refreshing: boolean; refreshError?: string; onRefresh: () => void; onGranularityChange: (value: AnalyticsGranularity) => void }) {
  const [area, setArea] = useState<(typeof ANALYTICS_AREAS)[number]>("전체");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AnalyticsEventRecord>();
  const metricByName = useMemo(() => new Map((metrics?.events ?? []).map((metric) => [metric.name, metric])), [metrics]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return events.filter((event) => {
      const matchesArea = area === "전체" || event.area === area;
      const matchesQuery = !normalized || [event.name, event.screen, event.trigger, event.description].some((value) => value.toLocaleLowerCase().includes(normalized));
      return matchesArea && matchesQuery;
    });
  }, [area, events, query]);
  const columns: TableProps<AnalyticsEventRecord>["columns"] = [
    { title: "이벤트명", dataIndex: "name", width: 220, render: (value, record) => <button type="button" className="table-primary-link" onClick={() => setSelected(record)}><strong>{value}</strong></button> },
    { title: "기능 영역", dataIndex: "area", width: 110, render: (value) => <Tag>{value}</Tag> },
    { title: "페이지·기능", dataIndex: "screen", width: 150 },
    { title: "이번 주 발생", width: 120, render: (_, record) => formatAnalyticsMetric(metricByName.get(record.name), "total") },
    { title: "고유 사용자", width: 120, render: (_, record) => formatAnalyticsMetric(metricByName.get(record.name), "uniques") },
    { title: "파라미터", width: 210, render: (_, record) => record.parameters.length ? <Space size={[4, 4]} wrap>{record.parameters.map((parameter) => <Tag key={parameter.name} color="blue">{parameter.name}{parameter.optional ? " · 선택" : ""}</Tag>)}</Space> : <Text type="secondary">없음</Text> },
    { title: "트리거 시점", dataIndex: "trigger", width: 320, ellipsis: true },
  ];

  return (
    <>
      <PageHeader view="analytics" action={<Button icon={<ReloadOutlined />} loading={refreshing} onClick={onRefresh}>새로고침</Button>} />
      <Card className="content-card analytics-intro-card">
        <div className="analytics-intro-copy"><Tag color="blue">Amplitude</Tag><Title level={3}>Amplitude 지표</Title></div>
        <div className="analytics-summary-grid"><div><strong>{events.length}개</strong><span>정의된 이벤트</span></div><div><strong>{new Set(events.map((event) => event.area)).size}개</strong><span>기능 영역</span></div><div><strong>{formatAnalyticsActiveUsers(metrics)}</strong><span>{metrics ? `${analyticsGranularityLabel(metrics.granularity)} 활성 사용자` : "활성 사용자"}</span></div><div><strong>{metrics ? formatSchedule(metrics.fetchedAt) : "—"}</strong><span>최근 수집</span></div></div>
      </Card>
      {refreshError && <Alert className="analytics-refresh-alert" type="warning" showIcon title={refreshError} />}
      <Card className="content-card table-card analytics-table-card">
        <div className="toolbar analytics-toolbar"><Segmented options={ANALYTICS_GRANULARITY_OPTIONS} value={granularity} onChange={(value) => onGranularityChange(value as AnalyticsGranularity)} aria-label="지표 조회 단위" /><Select value={area} onChange={setArea} aria-label="이벤트 기능 영역 필터" options={ANALYTICS_AREAS.map((item) => ({ label: item, value: item }))} /><Input.Search value={query} onChange={(event) => setQuery(event.target.value)} allowClear placeholder="이벤트명·페이지·트리거 검색" aria-label="이벤트 검색" /></div>
        <div className="result-summary"><Text strong>{filtered.length}개 이벤트</Text></div>
        {filtered.length ? <Table rowKey="id" columns={columns} dataSource={filtered} scroll={{ x: 1040 }} pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (total) => `총 ${total}개` }} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="조건에 맞는 이벤트가 없습니다." />}
      </Card>
      <Modal open={Boolean(selected)} title={selected?.name} width={700} footer={<Button onClick={() => setSelected(undefined)}>닫기</Button>} onCancel={() => setSelected(undefined)}>
        {selected && <div className="analytics-detail"><Descriptions bordered column={1} size="small"><Descriptions.Item label="기능 영역">{selected.area}</Descriptions.Item><Descriptions.Item label="페이지·기능">{selected.screen}</Descriptions.Item><Descriptions.Item label="플랫폼"><Tag color="blue">{selected.platform}</Tag></Descriptions.Item><Descriptions.Item label="트리거">{selected.trigger}</Descriptions.Item><Descriptions.Item label="설명">{selected.description}</Descriptions.Item><Descriptions.Item label="코드 근거">{selected.sourceFile}</Descriptions.Item></Descriptions><Title level={5}>파라미터</Title>{selected.parameters.length ? <Table size="small" pagination={false} rowKey="name" columns={[{ title: "이름", dataIndex: "name", width: 170 }, { title: "허용 값", dataIndex: "values", width: 180, render: (value) => value || "—" }, { title: "설명", dataIndex: "description" }]} dataSource={selected.parameters} /> : <Text type="secondary">전송 파라미터 없음</Text>}</div>}
      </Modal>
    </>
  );
}

const formatAnalyticsMetric = (metric: AnalyticsEventMetric | undefined, key: "total" | "uniques") => {
  const value = metric?.[key];
  return typeof value === "number" ? value.toLocaleString("ko-KR") : "—";
};

const formatAnalyticsActiveUsers = (metrics?: AnalyticsRefreshResult) => {
  const value = metrics?.activeUsers.at(-1)?.value;
  return typeof value === "number" ? `${value.toLocaleString("ko-KR")}명` : "—";
};

function QrParsingScreen({ onBack }: { onBack: () => void }) {
  const [platform, setPlatform] = useState<"Android" | "iOS">("Android");
  const rules = mockQrParsingRules.filter((rule) => rule.platform === platform);
  const columns: TableProps<QrParsingRule>["columns"] = [
    { title: "브랜드", width: 150, render: (_, rule) => <div className="table-primary-link table-primary-static"><strong>{rule.brand}</strong><span>{rule.variant || rule.platform}</span></div> },
    { title: "획득 흐름", dataIndex: "acquisitionFlow", width: 180, render: (value) => <Tag color={value.includes("다운로드") ? "orange" : value.includes("WebView") ? "blue" : "green"}>{value}</Tag> },
    { title: "QR 진입 패턴", dataIndex: "entryPattern", width: 220 },
    { title: "파싱 로직", dataIndex: "extractionRule", width: 280 },
    { title: "이미지 식별 규칙", dataIndex: "imageRule", width: 340 },
    { title: "형식·결과", width: 160, render: (_, rule) => <div className="qr-result-copy"><strong>{rule.expectedFormat}</strong><span>{rule.resultType}</span></div> },
  ];
  return (
    <>
      <PageHeader view="qr-parsing" action={<Button icon={<ArrowLeftOutlined />} onClick={onBack}>브랜드 관리로</Button>} />
      <Alert className="qr-parsing-note" type="info" showIcon title="브랜드별 QR 파싱·이미지 식별 규칙" description="앱 레포의 현재 구현을 기준으로 정리한 조회 화면입니다. Android는 WebView 진입 즉시 감지와 다운로드 선행 감지를 구분하고, iOS는 확인된 파싱 전략을 표시합니다." />
      <Card className="content-card qr-parsing-card">
        <Tabs activeKey={platform} onChange={(key) => setPlatform(key as "Android" | "iOS")} items={[{ key: "Android", label: "Android 파싱 로직" }, { key: "iOS", label: "iOS 파싱 로직" }]} />
        <div className="qr-parsing-summary"><Text strong>{platform} {rules.length}개 규칙</Text><Text type="secondary">이미지 식별 성공 시 결과: {platform === "Android" ? "imageUrl String" : "originalImage Data"}</Text></div>
        <Table rowKey="id" columns={columns} dataSource={rules} scroll={{ x: 1320 }} pagination={false} />
      </Card>
      <Card className="content-card qr-parsing-legend"><Title level={4}>화이트리스트 관리에 필요한 값</Title><Space wrap>{["QR 진입 호스트·경로", "획득 흐름", "이미지 호스트·경로", "확장자·형식", "파싱 규칙", "실패 시 대체 흐름"].map((item) => <Tag key={item}>{item}</Tag>)}</Space><Paragraph type="secondary">현재 화면은 조회용 목 데이터입니다. API 연결 시 브랜드 지원 여부만이 아니라 위 규칙 단위를 어댑터에서 변환해야 합니다.</Paragraph></Card>
    </>
  );
}

const toBrandDraft = (record: BrandRecord): BrandDraft => ({
  name: record.name,
  androidQrSupported: record.androidQrSupported,
  iosQrSupported: record.iosQrSupported,
  mapVisible: record.mapVisible,
});

const EMPTY_BRAND_DRAFT: BrandDraft = {
  name: "",
  androidQrSupported: false,
  iosQrSupported: false,
  mapVisible: false,
};

type BrandEditorTarget = BrandRecord | "new";

const normalizeDictionaryTerm = (value: string) => value.trim().toLocaleLowerCase().replace(/\s+/g, "");

function BrandScreen({ brands, dictionaries, setBrands, onOpenQrParsing }: { brands: BrandRecord[]; dictionaries: DictionaryRecord[]; setBrands: React.Dispatch<React.SetStateAction<BrandRecord[]>>; onOpenQrParsing: () => void }) {
  const { message, modal } = App.useApp();
  const [query, setQuery] = useState("");
  const [qrFilters, setQrFilters] = useState<BrandQrFilter[]>([]);
  const [mapFilters, setMapFilters] = useState<BrandMapFilter[]>([]);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<BrandEditorTarget>();
  const [draft, setDraft] = useState<BrandDraft>();
  const [saving, setSaving] = useState(false);
  const [highlighted, setHighlighted] = useState<string>();
  const [similar, setSimilar] = useState<BrandRecord[]>([]);
  const originalDraft = editing === "new" ? EMPTY_BRAND_DRAFT : editing ? toBrandDraft(editing) : undefined;
  const dirty = Boolean(draft && originalDraft && JSON.stringify(draft) !== JSON.stringify(originalDraft));
  const brandFiltersActive = Boolean(qrFilters.length || mapFilters.length);
  const filtersActive = Boolean(query || brandFiltersActive);
  const filtered = useMemo(() => brands
    .filter((brand) => {
      const dictionary = dictionaries.find((item) => item.canonicalTerm === brand.name);
      const normalizedQuery = normalizeDictionaryTerm(query);
      const matchesQuery = !normalizedQuery || [brand.name, ...(dictionary?.allowedTerms ?? [])].some((term) => normalizeDictionaryTerm(term).includes(normalizedQuery));
      const qrSupported = brand.androidQrSupported || brand.iosQrSupported;
      const matchesQr = qrFilters.length === 0
        || (qrFilters.includes("supported") && qrSupported)
        || (qrFilters.includes("unsupported") && !qrSupported);
      const matchesMap = mapFilters.length === 0
        || (mapFilters.includes("visible") && brand.mapVisible)
        || (mapFilters.includes("hidden") && !brand.mapVisible);
      return matchesQuery && matchesQr && matchesMap;
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ko")), [brands, dictionaries, mapFilters, qrFilters, query]);
  const qrFilterOptions = [
    { value: "supported" as const, label: <span className="brand-filter-binary-label"><BrandBooleanMark value yesLabel="QR 지원" noLabel="QR 미지원" /><span className="brand-filter-count" aria-hidden>{brands.filter((brand) => brand.androidQrSupported || brand.iosQrSupported).length}</span></span> },
    { value: "unsupported" as const, label: <span className="brand-filter-binary-label"><BrandBooleanMark value={false} yesLabel="QR 지원" noLabel="QR 미지원" /><span className="brand-filter-count" aria-hidden>{brands.filter((brand) => !brand.androidQrSupported && !brand.iosQrSupported).length}</span></span> },
  ];
  const mapFilterOptions = [
    { value: "visible" as const, label: <span className="brand-filter-binary-label"><BrandBooleanMark value yesLabel="지도 표시" noLabel="지도 미표시" /><span className="brand-filter-count" aria-hidden>{brands.filter((brand) => brand.mapVisible).length}</span></span> },
    { value: "hidden" as const, label: <span className="brand-filter-binary-label"><BrandBooleanMark value={false} yesLabel="지도 표시" noLabel="지도 미표시" /><span className="brand-filter-count" aria-hidden>{brands.filter((brand) => !brand.mapVisible).length}</span></span> },
  ];

  useEffect(() => {
    let active = true;
    if (!editing || !draft) return () => { active = false; };
    const timer = window.setTimeout(async () => {
      try {
        const result = await adminAdapter.findSimilarBrands(draft.name, editing === "new" ? undefined : editing.id);
        if (active) setSimilar(result);
      } catch {
        if (active) setSimilar([]);
      }
    }, 220);
    return () => { active = false; window.clearTimeout(timer); };
  }, [draft, editing]);
  const resetBrandFilters = () => { setQrFilters([]); setMapFilters([]); setPage(1); };
  const resetAllFilters = () => { setQuery(""); resetBrandFilters(); };
  const openCreate = () => {
    setSimilar([]);
    setEditing("new");
    setDraft({ ...EMPTY_BRAND_DRAFT });
  };
  const openEditor = (record: BrandRecord) => {
    setSimilar([]);
    setEditing(record);
    setDraft(toBrandDraft(record));
  };
  const closeEditor = () => {
    if (!dirty) { setEditing(undefined); setDraft(undefined); setSimilar([]); return; }
    modal.confirm({ title: "변경 내용을 버릴까요?", content: "저장하지 않은 브랜드 정보는 사라집니다.", okText: "변경 내용 버리기", cancelText: "계속 수정", onOk: () => { setEditing(undefined); setDraft(undefined); setSimilar([]); } });
  };
  const save = async () => {
    if (!editing || !draft) return;
    if (!draft.name.trim()) { message.warning("브랜드명을 입력해 주세요."); return; }
    const creating = editing === "new";
    setSaving(true);
    try {
      const record = await adminAdapter.saveBrand(draft, creating ? undefined : editing.id);
      setBrands((current) => creating ? [record, ...current] : current.map((item) => item.id === record.id ? record : item));
      setEditing(undefined);
      setDraft(undefined);
      setHighlighted(record.id);
      message.success(creating ? "브랜드를 추가했습니다." : "브랜드 정보를 수정했습니다.");
    } catch {
      message.error(creating ? "브랜드 추가에 실패했습니다. 입력 내용은 그대로 유지됩니다." : "브랜드 수정에 실패했습니다. 입력 내용은 그대로 유지됩니다.");
    } finally { setSaving(false); }
  };

  const columns: TableProps<BrandRecord>["columns"] = [
    { title: "브랜드명", dataIndex: "name", render: (value) => <Text strong>{value}</Text> },
    { title: "Android QR", width: 110, align: "center", render: (_, record) => <BrandBooleanMark value={record.androidQrSupported} yesLabel="Android QR 가능" noLabel="Android QR 불가" /> },
    { title: "iOS QR", width: 100, align: "center", render: (_, record) => <BrandBooleanMark value={record.iosQrSupported} yesLabel="iOS QR 가능" noLabel="iOS QR 불가" /> },
    { title: "지도 표시", width: 100, align: "center", render: (_, record) => <BrandBooleanMark value={record.mapVisible} yesLabel="지도 표시" noLabel="지도 미표시" /> },
    { title: "최근 수정일", dataIndex: "updatedAt", width: 130, responsive: ["lg"] },
    { title: "작업", width: 100, render: (_, record) => <Button type="link" size="small" onClick={() => openEditor(record)}>정보 수정</Button> },
  ];

  return (
    <>
      <PageHeader view="brands" action={<Space className="page-heading-actions" wrap><Button icon={<CodeOutlined />} onClick={onOpenQrParsing}>QR 파싱 로직</Button><Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>브랜드 추가</Button></Space>} />
      {highlighted && <Alert className="success-banner" type="success" showIcon closable={{ onClose: () => setHighlighted(undefined) }} title="변경한 브랜드를 목록에 반영했습니다." />}
      <Card className="content-card brand-filter-card">
        <div className="brand-filter-heading">
          <Title level={3}>브랜드 필터</Title>
          <Button type="text" size="small" icon={<ReloadOutlined />} className={`brand-filter-reset ${brandFiltersActive ? "" : "is-placeholder"}`} disabled={!brandFiltersActive} aria-hidden={!brandFiltersActive} tabIndex={brandFiltersActive ? 0 : -1} onClick={resetBrandFilters}>초기화</Button>
        </div>
        <div className="brand-filter-rows">
          <div className="brand-filter-row">
            <Text strong>QR 지원</Text>
            <Checkbox.Group<BrandQrFilter> name="brand-qr-filter" value={qrFilters} options={qrFilterOptions} aria-label="QR 지원 필터" onChange={(values) => { setQrFilters(values); setPage(1); }} />
          </div>
          <div className="brand-filter-row">
            <Text strong>지도 표시</Text>
            <Checkbox.Group<BrandMapFilter> name="brand-map-filter" value={mapFilters} options={mapFilterOptions} aria-label="지도 표시 필터" onChange={(values) => { setMapFilters(values); setPage(1); }} />
          </div>
        </div>
      </Card>
      <Card className="content-card table-card">
        <div className="brand-search-bar">
          <Input.Search value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="브랜드명 검색" allowClear aria-label="브랜드명 검색" />
        </div>
        <div className="result-summary"><Text strong>{filtered.length}개 브랜드</Text></div>
        {filtered.length ? <Table rowKey="id" rowClassName={(record) => record.id === highlighted ? "highlight-row" : ""} columns={columns} dataSource={filtered} scroll={{ x: 650 }} pagination={{ current: page, pageSize: 30, responsive: true, showLessItems: true, showSizeChanger: false, showTotal: (total) => `총 ${total}개`, onChange: setPage }} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={brands.length ? "검색 조건에 맞는 브랜드가 없습니다." : "등록된 브랜드가 없습니다."}>{brands.length ? filtersActive && <Button onClick={resetAllFilters}>검색과 필터 초기화</Button> : <Button type="primary" onClick={openCreate}>첫 브랜드 추가</Button>}</Empty>}
      </Card>

      <Modal open={Boolean(editing && draft)} title={editing === "new" ? "브랜드 추가" : "브랜드 정보 수정"} okText={editing === "new" ? "추가" : "저장"} cancelText="취소" confirmLoading={saving} onOk={save} onCancel={closeEditor}>
        {draft && <Form layout="vertical" requiredMark={false}>
          <Form.Item label="브랜드명" required>
            <Input value={draft.name} placeholder="네컷사진 브랜드의 대표 이름" onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </Form.Item>
          {similar.length > 0 && <Alert type="warning" showIcon title="유사한 브랜드가 있습니다" description={`${similar.map((item) => item.name).join(", ")} 브랜드와 중복되지 않는지 확인해 주세요.`} />}
          <div className="support-control">
            <Text strong>Android QR 지원</Text>
            <Switch checked={draft.androidQrSupported} onChange={(value) => setDraft({ ...draft, androidQrSupported: value })} checkedChildren="O" unCheckedChildren="X" aria-label="Android QR 지원 여부" />
          </div>
          <div className="support-control">
            <Text strong>iOS QR 지원</Text>
            <Switch checked={draft.iosQrSupported} onChange={(value) => setDraft({ ...draft, iosQrSupported: value })} checkedChildren="O" unCheckedChildren="X" aria-label="iOS QR 지원 여부" />
          </div>
          <div className="support-control">
            <Text strong>지도에 브랜드 표시</Text>
            <Switch checked={draft.mapVisible} onChange={(value) => setDraft({ ...draft, mapVisible: value })} checkedChildren="O" unCheckedChildren="X" aria-label="지도 표시 여부" />
          </div>
        </Form>}
      </Modal>
    </>
  );
}

const EMPTY_DICTIONARY_DRAFT: DictionaryDraft = { canonicalTerm: "", allowedTerms: [] };

function DictionaryScreen({ dictionaries, setDictionaries }: { dictionaries: DictionaryRecord[]; setDictionaries: React.Dispatch<React.SetStateAction<DictionaryRecord[]>> }) {
  const { message, modal } = App.useApp();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<DictionaryRecord | "new">();
  const [draft, setDraft] = useState<DictionaryDraft>();
  const [saving, setSaving] = useState(false);
  const [highlighted, setHighlighted] = useState<string>();
  const originalDraft = editing === "new" ? EMPTY_DICTIONARY_DRAFT : editing ? { canonicalTerm: editing.canonicalTerm, allowedTerms: editing.allowedTerms } : undefined;
  const dirty = Boolean(draft && originalDraft && JSON.stringify(draft) !== JSON.stringify(originalDraft));
  const filtered = useMemo(() => {
    const normalizedQuery = normalizeDictionaryTerm(query);
    return dictionaries
      .filter((entry) => !normalizedQuery || [entry.canonicalTerm, ...entry.allowedTerms].some((term) => normalizeDictionaryTerm(term).includes(normalizedQuery)))
      .sort((a, b) => a.canonicalTerm.localeCompare(b.canonicalTerm, "ko"));
  }, [dictionaries, query]);

  const openCreate = () => { setEditing("new"); setDraft({ ...EMPTY_DICTIONARY_DRAFT }); };
  const openEditor = (entry: DictionaryRecord) => { setEditing(entry); setDraft({ canonicalTerm: entry.canonicalTerm, allowedTerms: [...entry.allowedTerms] }); };
  const closeEditor = () => {
    if (!dirty) { setEditing(undefined); setDraft(undefined); return; }
    modal.confirm({ title: "변경 내용을 버릴까요?", content: "저장하지 않은 사전 항목은 사라집니다.", okText: "변경 내용 버리기", cancelText: "계속 수정", onOk: () => { setEditing(undefined); setDraft(undefined); } });
  };
  const save = async () => {
    if (!editing || !draft) return;
    const canonicalTerm = draft.canonicalTerm.trim();
    const allowedTerms = [...new Set(draft.allowedTerms.map((term) => term.trim()).filter(Boolean))].filter((term) => normalizeDictionaryTerm(term) !== normalizeDictionaryTerm(canonicalTerm));
    if (!canonicalTerm) { message.warning("원 단어를 입력해 주세요."); return; }
    if (dictionaries.some((entry) => entry.id !== (editing === "new" ? undefined : editing.id) && normalizeDictionaryTerm(entry.canonicalTerm) === normalizeDictionaryTerm(canonicalTerm))) {
      message.warning("같은 원 단어가 이미 등록되어 있습니다.");
      return;
    }
    setSaving(true);
    try {
      const record = await adminAdapter.saveDictionary({ canonicalTerm, allowedTerms }, editing === "new" ? undefined : editing.id);
      setDictionaries((current) => editing === "new" ? [record, ...current] : current.map((item) => item.id === record.id ? record : item));
      setEditing(undefined);
      setDraft(undefined);
      setHighlighted(record.id);
      message.success(editing === "new" ? "사전 항목을 추가했습니다." : "사전 항목을 수정했습니다.");
    } catch {
      message.error("사전 항목 저장에 실패했습니다. 입력 내용은 그대로 유지됩니다.");
    } finally { setSaving(false); }
  };
  const columns: TableProps<DictionaryRecord>["columns"] = [
    { title: "원 단어", dataIndex: "canonicalTerm", width: 190, render: (value) => <Text strong>{value}</Text> },
    { title: "허용 단어", render: (_, entry) => entry.allowedTerms.length ? <Space size={[4, 4]} wrap>{entry.allowedTerms.map((term) => <Tag key={term}>{term}</Tag>)}</Space> : <Text type="secondary">등록된 허용 단어 없음</Text> },
    { title: "허용 단어 수", width: 110, align: "center", render: (_, entry) => entry.allowedTerms.length },
    { title: "최근 수정일", dataIndex: "updatedAt", width: 130, responsive: ["lg"] },
    { title: "작업", width: 90, render: (_, entry) => <Button type="link" size="small" onClick={() => openEditor(entry)}>수정</Button> },
  ];

  return (
    <>
      <PageHeader view="dictionary" action={<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>사전 항목 추가</Button>} />
      {highlighted && <Alert className="success-banner" type="success" showIcon closable={{ onClose: () => setHighlighted(undefined) }} title="변경한 사전 항목을 목록에 반영했습니다." />}
      <Card className="content-card table-card">
        <div className="brand-search-bar"><Input.Search value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="원 단어 또는 허용 단어 검색" allowClear aria-label="사전 검색" /></div>
        <div className="result-summary"><Text strong>{filtered.length}개 사전 항목</Text></div>
        {filtered.length ? <Table rowKey="id" rowClassName={(entry) => entry.id === highlighted ? "highlight-row" : ""} columns={columns} dataSource={filtered} scroll={{ x: 720 }} pagination={{ current: page, pageSize: 30, responsive: true, showLessItems: true, showSizeChanger: false, showTotal: (total) => `총 ${total}개`, onChange: setPage }} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={dictionaries.length ? "검색 조건에 맞는 사전 항목이 없습니다." : "등록된 사전 항목이 없습니다."}>{dictionaries.length ? <Button onClick={() => setQuery("")}>검색어 초기화</Button> : <Button type="primary" onClick={openCreate}>첫 사전 항목 추가</Button>}</Empty>}
      </Card>
      <Modal open={Boolean(editing && draft)} title={editing === "new" ? "사전 항목 추가" : "사전 항목 수정"} okText={editing === "new" ? "추가" : "저장"} cancelText="취소" confirmLoading={saving} onOk={save} onCancel={closeEditor}>
        {draft && <Form layout="vertical" requiredMark={false}>
          <Form.Item label="원 단어" required><Input value={draft.canonicalTerm} placeholder="예: 인생네컷" onChange={(event) => setDraft({ ...draft, canonicalTerm: event.target.value })} /></Form.Item>
          <Form.Item label="허용 단어"><Input.TextArea value={draft.allowedTerms.join("\n")} rows={6} placeholder={"인생 네컷\n인샹네컷"} onChange={(event) => setDraft({ ...draft, allowedTerms: event.target.value.split(/\n/).map((term) => term.trim()).filter(Boolean) })} /></Form.Item>
        </Form>}
      </Modal>
    </>
  );
}

type PoseScreenProps = {
  poses: PoseRecord[];
  setPoses: React.Dispatch<React.SetStateAction<PoseRecord[]>>;
};

type PoseFilter = "all" | number;

const MAX_POSE_FILES = 10;
const MAX_POSE_FILE_SIZE = 10 * 1024 * 1024;

const isSupportedPoseFile = (file: File) =>
  ["image/jpeg", "image/png"].includes(file.type) || /\.(jpe?g|png)$/i.test(file.name);

function PoseScreen({ poses, setPoses }: PoseScreenProps) {
  const { message } = App.useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState<PoseFilter>("all");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [peopleCount, setPeopleCount] = useState(2);
  const [uploading, setUploading] = useState(false);
  const [highlighted, setHighlighted] = useState<string[]>([]);

  const previews = useMemo(
    () => selectedFiles.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [selectedFiles],
  );

  useEffect(() => () => previews.forEach(({ url }) => URL.revokeObjectURL(url)), [previews]);

  useEffect(() => {
    if (!highlighted.length) return;
    const timer = window.setTimeout(() => setHighlighted([]), 1800);
    return () => window.clearTimeout(timer);
  }, [highlighted]);

  const counts = useMemo(
    () => [1, 2, 3, 4].map((count) => ({ count, total: poses.filter((pose) => pose.peopleCount === count).length })),
    [poses],
  );

  const filtered = useMemo(
    () => filter === "all" ? poses : poses.filter((pose) => pose.peopleCount === filter),
    [filter, poses],
  );

  const addFiles = (incoming: File[]) => {
    const supported = incoming.filter(isSupportedPoseFile);
    const withinSize = supported.filter((file) => file.size <= MAX_POSE_FILE_SIZE);
    if (supported.length !== incoming.length) message.warning("JPG 또는 PNG 이미지만 선택할 수 있습니다.");
    if (withinSize.length !== supported.length) message.warning("이미지 한 장의 용량은 10MB 이하여야 합니다.");

    const existingKeys = new Set(selectedFiles.map((file) => `${file.name}-${file.size}-${file.lastModified}`));
    const unique = withinSize.filter((file) => !existingKeys.has(`${file.name}-${file.size}-${file.lastModified}`));
    const room = Math.max(0, MAX_POSE_FILES - selectedFiles.length);
    if (unique.length > room) message.warning(`한 번에 최대 ${MAX_POSE_FILES}장까지 업로드할 수 있습니다.`);
    setSelectedFiles((current) => [...current, ...unique.slice(0, room)]);
  };

  const resetUpload = () => {
    setSelectedFiles([]);
    setPeopleCount(2);
    setUploadOpen(false);
  };

  const upload = async () => {
    if (!selectedFiles.length) {
      message.warning("업로드할 이미지를 한 장 이상 선택해 주세요.");
      return;
    }
    setUploading(true);
    try {
      const records = await adminAdapter.uploadPoses(selectedFiles.map((file) => ({ file, peopleCount })));
      setPoses((current) => [...records, ...current.filter((pose) => !records.some((record) => record.id === pose.id))]);
      setFilter(peopleCount);
      setHighlighted(records.map((record) => record.id));
      message.success(`${records.length}개의 포즈를 등록했습니다.`);
      resetUpload();
    } catch {
      message.error("포즈를 등록하지 못했습니다. 선택한 이미지는 그대로 유지됩니다.");
    } finally {
      setUploading(false);
    }
  };

  const filterItems: Array<{ key: PoseFilter; label: string; total: number }> = [
    { key: "all", label: "전체", total: poses.length },
    ...counts.map(({ count, total }) => ({ key: count, label: `${count}인`, total })),
  ];

  return (
    <>
      <PageHeader
        view="poses"
        action={<Button type="primary" onClick={() => setUploadOpen(true)}>포즈 업로드</Button>}
      />

      <Card className="content-card pose-library-card">
        <div className="pose-library-heading">
          <Title level={3}>포즈 목록</Title>
          <Text className="pose-total-copy"><strong>{filtered.length}</strong>개</Text>
        </div>

        <div className="pose-filter-rail">
          <Segmented<PoseFilter>
            block
            className="pose-filter-segmented"
            classNames={{ item: "pose-filter-segment-item" }}
            name="pose-people-filter"
            size="large"
            value={filter}
            aria-label="포즈 인원수 필터"
            options={filterItems.map((item) => ({
              value: item.key,
              label: (
                <span className="filter-segment-label">
                  <span>{item.label}</span>
                  <span className="filter-segment-count" aria-hidden="true">{item.total}</span>
                  <span className="sr-only">{item.total}개</span>
                </span>
              ),
            }))}
            onChange={setFilter}
          />
        </div>

        {filtered.length ? (
          <div className="pose-grid" data-testid="pose-grid">
            {filtered.map((pose) => (
              <article key={pose.id} className={highlighted.includes(pose.id) ? "pose-card highlighted" : "pose-card"}>
                <div className="pose-image-frame">
                  <Image
                    src={pose.imageUrl}
                    alt={`${pose.peopleCount}인 촬영 포즈`}
                    className="pose-image"
                    preview={{ mask: "크게 보기" }}
                  />
                </div>
                <div className="pose-card-body">
                  <div className="pose-card-meta">
                    <Tag className={`pose-people-tag people-${Math.min(pose.peopleCount, 4)}`}>{pose.peopleCount}인</Tag>
                    <Text type="secondary">{pose.createdAt}</Text>
                  </div>
                  <Text className="pose-file-name" ellipsis={{ tooltip: pose.originalFileName }}>{pose.originalFileName}</Text>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={poses.length ? `${filter}인 포즈가 아직 없습니다.` : "아직 등록된 포즈가 없습니다."}
          >
            {poses.length ? <Button onClick={() => setFilter("all")}>전체 포즈 보기</Button> : <Button type="primary" onClick={() => setUploadOpen(true)}>첫 포즈 업로드</Button>}
          </Empty>
        )}
      </Card>

      <Modal
        open={uploadOpen}
        title="포즈 업로드"
        width={760}
        okText={`${selectedFiles.length}개 포즈 등록`}
        cancelText="취소"
        confirmLoading={uploading}
        okButtonProps={{ disabled: selectedFiles.length === 0 }}
        onOk={upload}
        onCancel={() => !uploading && resetUpload()}
      >
        <Alert
          type="info"
          showIcon
          title="JPG·PNG · 장당 10MB 이하 · 최대 10장"
        />

        <Form layout="vertical" requiredMark={false} className="pose-upload-form">
          <Form.Item label="함께 찍는 인원수" required>
            <Radio.Group
              value={peopleCount}
              onChange={(event) => setPeopleCount(event.target.value)}
              optionType="button"
              buttonStyle="solid"
              options={[1, 2, 3, 4].map((count) => ({ label: `${count}인`, value: count }))}
              aria-label="포즈 인원수"
            />
          </Form.Item>

          <Form.Item label="포즈 이미지" required extra={`${selectedFiles.length}/${MAX_POSE_FILES}장 선택`}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png"
              multiple
              hidden
              onChange={(event) => {
                addFiles(Array.from(event.target.files ?? []));
                event.target.value = "";
              }}
            />
            <div
              className="pose-dropzone"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                addFiles(Array.from(event.dataTransfer.files));
              }}
            >
              <strong>이미지를 끌어놓거나 파일을 선택하세요</strong>
              <Button onClick={() => fileInputRef.current?.click()}>이미지 선택</Button>
            </div>
          </Form.Item>
        </Form>

        {previews.length > 0 && (
          <div className="pose-upload-previews" aria-label="선택한 포즈 이미지">
            {previews.map(({ file, url }) => (
              <div key={`${file.name}-${file.size}-${file.lastModified}`} className="pose-upload-preview">
                <Image src={url} alt={`${file.name} 미리보기`} preview={false} />
                <button
                  type="button"
                  onClick={() => setSelectedFiles((current) => current.filter((item) => item !== file))}
                  aria-label={`${file.name} 제거`}
                >
                  제거
                </button>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}

function AdminWorkspace() {
  const [view, setView] = useState<ViewKey>("notifications");
  const [data, setData] = useState<AdminSnapshot>(EMPTY_SNAPSHOT);
  const [loadMode, setLoadMode] = useState<LoadMode>("success");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [analyticsMetrics, setAnalyticsMetrics] = useState<AnalyticsRefreshResult>();
  const [analyticsGranularity, setAnalyticsGranularity] = useState<AnalyticsGranularity>("day");
  const [analyticsRefreshing, setAnalyticsRefreshing] = useState(false);
  const [analyticsRefreshError, setAnalyticsRefreshError] = useState<string>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams(window.location.search);
      const stateParam = params.get("state");
      const mode: LoadMode = stateParam === "empty" || stateParam === "error" ? stateParam : "success";
      setLoadMode(mode);
      setData(await adminAdapter.load(mode));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const syncFromUrl = () => {
      const value = new URLSearchParams(window.location.search).get("view") as ViewKey | null;
      if (value && value in VIEW_META) setView(value);
    };
    window.addEventListener("popstate", syncFromUrl);
    const initialLoad = window.setTimeout(() => {
      syncFromUrl();
      void load();
    }, 0);
    return () => {
      window.clearTimeout(initialLoad);
      window.removeEventListener("popstate", syncFromUrl);
    };
  }, [load]);

  const navigate = (next: ViewKey) => {
    setView(next);
    const url = new URL(window.location.href);
    url.searchParams.set("view", next);
    window.history.pushState({}, "", url);
  };

  const refreshAnalytics = async (requestedGranularity = analyticsGranularity) => {
    setAnalyticsGranularity(requestedGranularity);
    setAnalyticsRefreshing(true);
    setAnalyticsRefreshError(undefined);
    try {
      setAnalyticsMetrics(await adminAdapter.refreshAnalytics(requestedGranularity));
    } catch (refreshError) {
      setAnalyticsRefreshError(refreshError instanceof Error ? refreshError.message : "Amplitude 지표를 불러오지 못했습니다.");
    } finally {
      setAnalyticsRefreshing(false);
    }
  };

  return (
    <Layout className="admin-shell">
      <Sider width={248} className="admin-sider" theme="light">
        <button className="brand" type="button" onClick={() => navigate("dashboard")} aria-label="Neki Admin 대시보드">
          <span className="brand-mark">N</span>
          <span className="brand-name">Neki</span>
          <span className="brand-product">Admin</span>
        </button>
        <Menu mode="inline" selectedKeys={[view]} items={menuItems} onClick={({ key }) => navigate(key as ViewKey)} className="side-menu" />
        <div className="sider-footer">
          <Button type="text" block className="logout-button">로그아웃</Button>
        </div>
      </Sider>
      <Layout>
        <Header className="admin-header">
          <Flex align="center" gap={12} className="header-actions">
            <button className="profile-button" type="button" aria-label="관리자 프로필 열기">
              <Avatar size={36}>N</Avatar><span className="profile-copy"><strong>네키 운영자</strong><small>Super Admin</small></span>
            </button>
          </Flex>
        </Header>
        <nav className="mobile-nav" aria-label="관리 화면 이동">
          {mobileNavItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={view === item.key ? "selected" : ""}
              aria-current={view === item.key ? "page" : undefined}
              onClick={() => navigate(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <Content className="admin-content">
          {view === "dashboard" ? <OverviewScreen mode={loadMode} /> : loading ? <LoadingPanel label="운영 데이터를 불러오고 있어요" /> : error ? <ErrorPanel onRetry={load} /> : (
            <>
              {view === "notifications" && <NotificationScreen records={data.notifications} setRecords={(update) => setData((current) => ({ ...current, notifications: typeof update === "function" ? update(current.notifications) : update }))} />}
              {view === "stores" && <StoreScreen stores={data.stores} brands={data.brands} setStores={(update) => setData((current) => ({ ...current, stores: typeof update === "function" ? update(current.stores) : update }))} />}
              {view === "brands" && <BrandScreen brands={data.brands} dictionaries={data.dictionaries} setBrands={(update) => setData((current) => ({ ...current, brands: typeof update === "function" ? update(current.brands) : update }))} onOpenQrParsing={() => navigate("qr-parsing")} />}
              {view === "dictionary" && <DictionaryScreen dictionaries={data.dictionaries} setDictionaries={(update) => setData((current) => ({ ...current, dictionaries: typeof update === "function" ? update(current.dictionaries) : update }))} />}
              {view === "poses" && <PoseScreen poses={data.poses} setPoses={(update) => setData((current) => ({ ...current, poses: typeof update === "function" ? update(current.poses) : update }))} />}
              {view === "analytics" && <AnalyticsScreen events={data.analyticsEvents} metrics={analyticsMetrics} granularity={analyticsGranularity} refreshing={analyticsRefreshing} refreshError={analyticsRefreshError} onRefresh={() => void refreshAnalytics()} onGranularityChange={(next) => void refreshAnalytics(next)} />}
              {view === "qr-parsing" && <QrParsingScreen onBack={() => navigate("brands")} />}
            </>
          )}
        </Content>
      </Layout>
    </Layout>
  );
}

export default function AdminApp() {
  return (
    <ConfigProvider locale={koKR} theme={{
      token: {
        colorPrimary: "#f55243",
        colorInfo: "#1677ff",
        colorSuccess: "#2f9e64",
        colorWarning: "#d99119",
        colorError: "#d84a3d",
        colorText: "#202227",
        colorTextSecondary: "#6f7382",
        colorBorder: "#e3e4e8",
        colorBgLayout: "#f7f8f8",
        borderRadius: 10,
        borderRadiusLG: 16,
        controlHeight: 40,
        fontFamily: "Pretendard, -apple-system, BlinkMacSystemFont, sans-serif",
      },
      components: {
        Button: { controlHeight: 40, fontWeight: 650 },
        Card: { bodyPadding: 24 },
        Menu: { itemBorderRadius: 10, itemHeight: 44 },
        Segmented: {
          itemActiveBg: "#ffe4df",
          itemColor: "#5c606d",
          itemHoverBg: "#ffe4df",
          itemHoverColor: "#9f251c",
          itemSelectedBg: "#ffffff",
          itemSelectedColor: "#9f251c",
          trackBg: "#fff4f2",
          trackPadding: 4,
        },
        Table: { headerBg: "#f7f8f8", headerColor: "#686d7b", cellPaddingBlock: 15 },
        Form: { itemMarginBottom: 22 },
        Modal: { titleFontSize: 18 },
      },
    }}>
      <App><AdminWorkspace /></App>
    </ConfigProvider>
  );
}
