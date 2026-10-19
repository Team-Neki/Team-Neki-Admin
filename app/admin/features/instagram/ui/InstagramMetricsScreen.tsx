"use client";

import { useState } from "react";
import ReloadOutlined from "@ant-design/icons/ReloadOutlined";
import { Alert, Button, Card, DatePicker, Empty, Image, Segmented, Spin, Statistic, Table, Tabs, Tag, Tooltip, Typography, type TableProps } from "antd";
import dayjs from "dayjs";
import type { InstagramMetricsSnapshot, InstagramPostMetric } from "../../../types";
import { AdminPageHeader } from "../../../shared/ui/AdminPageHeader";
import { INSTAGRAM_MIN_DATE, INSTAGRAM_RANGE_OPTIONS, formatInstagramMetric, instagramRangeForPreset, instagramToday, type InstagramRangePreset } from "../model/instagram-metrics";
import { useInstagramMetrics } from "../model/useInstagramMetrics";
import styles from "./InstagramMetricsScreen.module.css";
import { InstagramMediaDialog } from "./InstagramMediaDialog";
import { InstagramStoriesPanel } from "./InstagramStoriesPanel";

const { Text, Title } = Typography;
const missingMetric = <Tooltip title="제공되지 않은 지표">—</Tooltip>;
const renderMetric = (value: number | null) => value === null ? missingMetric : formatInstagramMetric(value);
const metricSort = (key: "views" | "comments" | "shares" | "saves" | "reach" | "profileVisits") => (a: InstagramPostMetric, b: InstagramPostMetric) => (a[key] ?? -1) - (b[key] ?? -1);

function InstagramTrendChart({ points }: { points: InstagramMetricsSnapshot["trend"] }) {
  const maxValue = Math.max(...points.map((point) => point.reach ?? 0), 1);
  return <div className="instagram-chart-scroll">
    <div className="instagram-chart" role="list" aria-label="Instagram 일별 도달수">
      {points.map((point) => <Tooltip key={point.periodEndsAt} title={<>{dayjs(point.date).format("YYYY.MM.DD")} · 도달 {formatInstagramMetric(point.reach)}<br />집계 종료 {new Date(point.periodEndsAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</>}>
        <div className="instagram-chart-column" role="listitem" tabIndex={0} aria-label={`${point.date} 도달수 ${formatInstagramMetric(point.reach)}`}>
          <div className="instagram-chart-track">
            {point.reach !== null && point.reach > 0 && <span className={`instagram-chart-bar ${styles.reachBar}`} style={{ height: `${point.reach / maxValue * 100}%` }} />}
          </div>
          <span>{dayjs(point.date).format("M.D")}</span>
        </div>
      </Tooltip>)}
    </div>
  </div>;
}

export function InstagramMetricsScreen() {
  const { range, setRange, data, loading, loadingMore, error, cooldownRemaining, refresh, loadMore, contentTab, setContentTab } = useInstagramMetrics();
  const [selectedMedia, setSelectedMedia] = useState<string | null>(null);
  const preset = INSTAGRAM_RANGE_OPTIONS.find(({ value }) => {
    const dates = instagramRangeForPreset(value);
    return range[0].isSame(dates[0], "day") && range[1].isSame(dates[1], "day");
  })?.value;
  const periodLabel = `${range[0].format("YYYY.MM.DD")} – ${range[1].format("YYYY.MM.DD")}`;
  const summaryCards = [
    { key: "followers", title: "팔로워 수", value: data?.followers, scope: "현재" },
    { key: "reach", title: "도달수", value: data?.reach, scope: "선택 기간" },
    { key: "likes", title: "총 좋아요수", value: data?.likes, scope: "선택 기간" },
    { key: "views", title: "총 조회수", value: data?.views, scope: "선택 기간" },
  ];
  const columns: TableProps<InstagramPostMetric>["columns"] = [
    { title: "콘텐츠", key: "content", width: 310, render: (_, post) => <div className="instagram-content-cell">
      {post.thumbnailUrl ? <Image src={post.thumbnailUrl} alt="" width={56} height={56} preview={false} fallback="/icon.png" /> : <span className={styles.imageFallback} aria-label="미리보기 없음">—</span>}
      <div><button type="button" className={styles.postLink} onClick={() => setSelectedMedia(post.id)} aria-label={`${post.title} 상세 보기`}><strong>{post.title}</strong></button>
        <span>{post.mediaType} · {new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium" }).format(new Date(post.publishedAt))}</span>
      </div>
    </div> },
    { title: "조회수", dataIndex: "views", width: 120, align: "right", sorter: metricSort("views"), defaultSortOrder: "descend", render: renderMetric },
    { title: "댓글", dataIndex: "comments", width: 96, align: "right", sorter: metricSort("comments"), render: renderMetric },
    { title: "공유", dataIndex: "shares", width: 96, align: "right", sorter: metricSort("shares"), render: renderMetric },
    { title: "저장", dataIndex: "saves", width: 96, align: "right", sorter: metricSort("saves"), render: renderMetric },
    { title: "도달", dataIndex: "reach", width: 116, align: "right", sorter: metricSort("reach"), render: renderMetric },
    { title: "프로필 방문", dataIndex: "profileVisits", width: 130, align: "right", sorter: metricSort("profileVisits"), render: renderMetric },
  ];
  return <>
    <AdminPageHeader title="Instagram 지표" action={<Button icon={<ReloadOutlined />} loading={loading} disabled={loadingMore || cooldownRemaining > 0} onClick={refresh}>새로고침</Button>} />
    <div className={styles.status}>
      <Text type="secondary">{data ? `@${data.username}` : "@neki_official_"}</Text>
      <Text type="secondary">{cooldownRemaining > 0 ? `${cooldownRemaining}초 후 재조회 가능` : data ? `${data.storage?.readFrom === "file" ? "저장 데이터" : "수집"} ${new Date(data.fetchedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}` : loading ? "불러오는 중…" : "연결 확인 필요"}</Text>
    </div>
    {error && <Alert className={styles.notice} type="error" showIcon title={error} action={<Button size="small" onClick={refresh} disabled={loading || loadingMore || cooldownRemaining > 0}>다시 시도</Button>} />}
    {!!data?.warnings.length && <Alert className={styles.notice} type="warning" showIcon title={data.warnings.join(" ")} />}
    <Card className="content-card instagram-period-card" size="small">
      <div className="instagram-period-toolbar">
        <Segmented<InstagramRangePreset> name="instagram-range-presets" value={preset} options={INSTAGRAM_RANGE_OPTIONS} onChange={(value) => setRange(instagramRangeForPreset(value))} aria-label="Instagram 조회 기간 프리셋" />
        <DatePicker.RangePicker value={range} allowClear={false} inputReadOnly minDate={INSTAGRAM_MIN_DATE} maxDate={instagramToday()} classNames={{ popup: { root: styles.calendarPopup } }} format="YYYY.MM.DD" placeholder={["시작일", "종료일"]} onChange={(dates) => dates?.[0] && dates[1] && setRange([dates[0].startOf("day"), dates[1].startOf("day")])} aria-label="Instagram 지표 조회 기간" />
        <Text type="secondary">{periodLabel}</Text>
      </div>
    </Card>
    <div className="instagram-summary-grid" aria-busy={loading}>
      {summaryCards.map((item) => <Card key={item.key} className={`content-card instagram-summary-card is-${item.key}`}>
        <Statistic title={item.title} value={item.value ?? "—"} formatter={() => formatInstagramMetric(item.value)} />
        <Text type="secondary" className={styles.scope}>{item.scope}</Text>
      </Card>)}
    </div>
    <Card className="content-card instagram-trend-card">
      <div className="instagram-section-heading"><div><Title level={2}>일별 도달 추이</Title><Text type="secondary">Meta 집계 · {periodLabel}</Text></div></div>
      <Spin spinning={loading && !data} description="지표 조회 중"><div className={styles.chartBody}>
        {data?.trend.some((point) => point.reach !== null) ? <InstagramTrendChart points={data.trend} /> : !loading && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={error ? "지표를 불러오지 못했습니다." : "제공된 일별 지표가 없습니다."} />}
      </div></Spin>
    </Card>
    <Card className="content-card table-card instagram-content-card">
      <Tabs activeKey={contentTab} onChange={setContentTab} destroyOnHidden items={[{ key: "feed", label: "피드", children: <>
      <div className="instagram-section-heading instagram-table-heading"><div><Title level={2}>게시물별 성과</Title><Text type="secondary">전체 게시물 · 누적 성과</Text></div><Tag>{data?.posts.length ?? 0}개{data?.nextCursor ? "+" : ""}</Tag></div>
      <Table rowKey="id" columns={columns} dataSource={data?.posts ?? []} pagination={false} scroll={{ x: 964 }} loading={loading || loadingMore} locale={{ emptyText: error ? "게시물을 불러오지 못했습니다." : "표시할 게시물이 없습니다." }} showSorterTooltip={{ title: "정렬" }} />
      {data?.nextCursor && <div className={styles.more}><Button onClick={loadMore} loading={loadingMore} disabled={loading || cooldownRemaining > 0}>이전 게시물 더 보기</Button></div>}
      </> }, { key: "stories", label: "스토리", children: <InstagramStoriesPanel onSelect={setSelectedMedia} /> }]} />
    </Card>
    <InstagramMediaDialog id={selectedMedia} onClose={() => setSelectedMedia(null)} />
  </>;
}
