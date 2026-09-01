"use client";

import ReloadOutlined from "@ant-design/icons/ReloadOutlined";
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Empty,
  Input,
  Modal,
  Segmented,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  type TableProps,
} from "antd";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { AdminPageHeader } from "../../../shared/ui/AdminPageHeader";
import type {
  AnalyticsEventMetric,
  AnalyticsEventRecord,
  AnalyticsGranularity,
  AnalyticsRefreshResult,
} from "../../../types";
import {
  ANALYTICS_GRANULARITY_OPTIONS,
  ANALYTICS_GROUP_AREAS,
  ANALYTICS_GROUP_OPTIONS,
  ANALYTICS_MIN_DATE,
  analyticsGranularityLabel,
  analyticsRangePresets,
  type AnalyticsDateRange,
  type AnalyticsGroup,
} from "../model/analytics";

const { Text, Title } = Typography;

type AnalyticsScreenProps = {
  events: AnalyticsEventRecord[];
  metrics?: AnalyticsRefreshResult;
  granularity: AnalyticsGranularity;
  range: AnalyticsDateRange;
  refreshing: boolean;
  cooldownRemaining: number;
  refreshError?: string;
  onRefresh: () => void;
  onGranularityChange: (value: AnalyticsGranularity) => void;
  onRangeChange: (value: AnalyticsDateRange) => void;
};

const formatMetric = (metric: AnalyticsEventMetric | undefined, key: "total" | "uniques") => {
  const value = metric?.[key];
  return typeof value === "number" ? value.toLocaleString("ko-KR") : "—";
};

const formatActiveUsers = (metrics?: AnalyticsRefreshResult) => {
  const value = metrics?.activeUsers.at(-1)?.value;
  return typeof value === "number" ? `${value.toLocaleString("ko-KR")}명` : "—";
};

const formatFetchedAt = (value?: string) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(date);
};

export function AnalyticsScreen({
  events,
  metrics,
  granularity,
  range,
  refreshing,
  cooldownRemaining,
  refreshError,
  onRefresh,
  onGranularityChange,
  onRangeChange,
}: AnalyticsScreenProps) {
  const [group, setGroup] = useState<AnalyticsGroup>("all");
  const [query, setQuery] = useState("");
  const [paginationEnabled, setPaginationEnabled] = useState(false);
  const [selected, setSelected] = useState<AnalyticsEventRecord>();
  const metricByName = useMemo(() => new Map((metrics?.events ?? []).map((metric) => [metric.name, metric])), [metrics]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return events.filter((event) => {
      const matchesGroup = group === "all" || event.area === ANALYTICS_GROUP_AREAS[group];
      const matchesQuery = !normalized || [event.name, event.screen, event.trigger, event.description]
        .some((value) => value.toLocaleLowerCase().includes(normalized));
      return matchesGroup && matchesQuery;
    });
  }, [events, group, query]);
  const columns: TableProps<AnalyticsEventRecord>["columns"] = [
    { title: "이벤트명", dataIndex: "name", width: 220, render: (value, record) => <button type="button" className="table-primary-link" onClick={() => setSelected(record)}><strong>{value}</strong></button> },
    { title: "기능 영역", dataIndex: "area", width: 120, sorter: (a, b) => a.area.localeCompare(b.area, "ko"), sortDirections: ["ascend", "descend"], render: (value) => <Tag>{value}</Tag> },
    { title: "페이지·기능", dataIndex: "screen", width: 150 },
    { title: "선택 기간 발생", width: 140, sorter: (a, b) => (metricByName.get(a.name)?.total ?? 0) - (metricByName.get(b.name)?.total ?? 0), sortDirections: ["descend", "ascend"], render: (_, record) => formatMetric(metricByName.get(record.name), "total") },
    { title: "고유 사용자", width: 130, sorter: (a, b) => (metricByName.get(a.name)?.uniques ?? 0) - (metricByName.get(b.name)?.uniques ?? 0), sortDirections: ["descend", "ascend"], render: (_, record) => formatMetric(metricByName.get(record.name), "uniques") },
    { title: "파라미터", width: 210, render: (_, record) => record.parameters.length ? <Space size={[4, 4]} wrap>{record.parameters.map((parameter) => <Tag key={parameter.name} color="blue">{parameter.name}{parameter.optional ? " · 선택" : ""}</Tag>)}</Space> : <Text type="secondary">없음</Text> },
    { title: "트리거 시점", dataIndex: "trigger", width: 320, ellipsis: true },
  ];

  return (
    <>
      <AdminPageHeader title="Amplitude 지표" action={<Button icon={<ReloadOutlined />} disabled={refreshing || cooldownRemaining > 0} loading={refreshing} onClick={onRefresh}>{cooldownRemaining > 0 ? `${cooldownRemaining}초 후 새로고침` : "새로고침"}</Button>} />
      <Card className="content-card analytics-intro-card">
        <div className="analytics-intro-copy"><Tag color="blue">Amplitude</Tag><Title level={3}>Amplitude 지표</Title></div>
        <div className="analytics-summary-grid"><div><strong>{events.length}개</strong><span>정의된 이벤트</span></div><div><strong>{new Set(events.map((event) => event.area)).size}개</strong><span>기능 영역</span></div><div><strong>{formatActiveUsers(metrics)}</strong><span>{metrics ? `${analyticsGranularityLabel(metrics.granularity)} 활성 사용자` : "활성 사용자"}</span></div><div><strong>{formatFetchedAt(metrics?.fetchedAt)}</strong><span>최근 수집</span></div></div>
      </Card>
      {refreshError && <Alert className="analytics-refresh-alert" type="warning" showIcon title={refreshError} />}
      <Card className="content-card table-card analytics-table-card">
        <div className="analytics-group-bar"><Text strong>그룹별 보기</Text><Segmented className="analytics-group-segmented" options={ANALYTICS_GROUP_OPTIONS} value={group} onChange={(value) => setGroup(value as AnalyticsGroup)} aria-label="이벤트 그룹 필터" /></div>
        <div className="toolbar analytics-toolbar"><DatePicker.RangePicker className="analytics-range-picker" value={range} allowClear={false} inputReadOnly minDate={ANALYTICS_MIN_DATE} maxDate={dayjs().startOf("day")} presets={analyticsRangePresets()} format="YYYY.MM.DD" onChange={(dates) => dates?.[0] && dates[1] && onRangeChange([dates[0].startOf("day"), dates[1].startOf("day")])} aria-label="지표 조회 기간" /><Segmented options={ANALYTICS_GRANULARITY_OPTIONS} value={granularity} disabled={refreshing} onChange={(value) => onGranularityChange(value as AnalyticsGranularity)} aria-label="지표 조회 단위" /><Input.Search value={query} onChange={(event) => setQuery(event.target.value)} allowClear placeholder="이벤트명·페이지·트리거 검색" aria-label="이벤트 검색" /></div>
        <div className="result-summary"><Text strong>{filtered.length}개 이벤트</Text><Space size={8}><Text type="secondary">페이지네이션</Text><Switch size="small" checked={paginationEnabled} onChange={setPaginationEnabled} checkedChildren="ON" unCheckedChildren="OFF" aria-label="페이지네이션" /></Space></div>
        {filtered.length ? <Table rowKey="id" columns={columns} dataSource={filtered} scroll={{ x: 1040 }} pagination={paginationEnabled ? { pageSize: 10, showSizeChanger: false, showTotal: (total) => `총 ${total}개` } : false} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="조건에 맞는 이벤트가 없습니다." />}
      </Card>
      <Modal open={Boolean(selected)} title={selected?.name} width={700} footer={<Button onClick={() => setSelected(undefined)}>닫기</Button>} onCancel={() => setSelected(undefined)}>
        {selected && <div className="analytics-detail"><Descriptions bordered column={1} size="small"><Descriptions.Item label="기능 영역">{selected.area}</Descriptions.Item><Descriptions.Item label="페이지·기능">{selected.screen}</Descriptions.Item><Descriptions.Item label="플랫폼"><Tag color="blue">{selected.platform}</Tag></Descriptions.Item><Descriptions.Item label="트리거">{selected.trigger}</Descriptions.Item><Descriptions.Item label="설명">{selected.description}</Descriptions.Item><Descriptions.Item label="코드 근거">{selected.sourceFile}</Descriptions.Item></Descriptions><Title level={5}>파라미터</Title>{selected.parameters.length ? <Table size="small" pagination={false} rowKey="name" columns={[{ title: "이름", dataIndex: "name", width: 170 }, { title: "허용 값", dataIndex: "values", width: 180, render: (value) => value || "—" }, { title: "설명", dataIndex: "description" }]} dataSource={selected.parameters} /> : <Text type="secondary">전송 파라미터 없음</Text>}</div>}
      </Modal>
    </>
  );
}
