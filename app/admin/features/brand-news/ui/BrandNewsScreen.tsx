"use client";

import ReloadOutlined from "@ant-design/icons/ReloadOutlined";
import { Alert, Button, Card, Empty, Input, Select, Table, Tabs, Tag, Typography, type TableProps } from "antd";
import type { BrandNewsRecord, BrandNewsSource } from "../../../types";
import { AdminPageHeader } from "../../../shared/ui/AdminPageHeader";
import { categoryLabel, failureLabel, filterNews, formatNewsTime, statusLabel } from "../model/brand-news";
import { useBrandNews } from "../model/useBrandNews";
import { useBrandNewsFilters } from "../model/useBrandNewsFilters";
import styles from "./BrandNewsScreen.module.css";

const { Text, Link } = Typography;
const PAGE_SIZE = 30;

export function BrandNewsScreen() {
  const { data, loading, error, refresh } = useBrandNews();
  const filters = useBrandNewsFilters();
  const activeBrand = data?.snapshot.sources.some((source) => source.brandId === filters.brand) ? filters.brand : "all";
  const records = filterNews(data?.snapshot.records ?? [], { ...filters, brand: activeBrand });
  const currentPage = Math.min(filters.page, Math.max(1, Math.ceil(records.length / PAGE_SIZE)));
  const columns: TableProps<BrandNewsRecord>["columns"] = [
    { title: "브랜드", key: "brand", dataIndex: "brandName", width: 135, sorter: true, sortOrder: filters.sort === "brand" ? filters.direction : null },
    { title: "소식", dataIndex: "title", width: 400, render: (value, record) => <Link href={record.url} target="_blank" rel="noopener noreferrer">{value}</Link> },
    { title: "유형", dataIndex: "category", width: 100, render: (value: BrandNewsRecord["category"]) => <Tag>{categoryLabel[value]}</Tag> },
    { title: "게시일", key: "published", dataIndex: "publishedOn", width: 125, sorter: true, sortOrder: filters.sort === "published" ? filters.direction : null, render: (value) => value ?? "미확인" },
    { title: "게시된 기간", width: 220, render: (_, record) => record.startsOn || record.endsOn ? `${record.startsOn ?? "미확인"} ~ ${record.endsOn ?? "미확인"}` : <Text type="secondary">미확인</Text> },
    { title: "검토", dataIndex: "reviewStatus", width: 100, render: (value: BrandNewsRecord["reviewStatus"]) => <Tag>{value === "approved" ? "검토 완료" : value === "rejected" ? "제외" : "검토 대기"}</Tag> },
  ];
  const sourceColumns: TableProps<BrandNewsSource>["columns"] = [
    { title: "브랜드", dataIndex: "brandName", width: 135, render: (value, record) => <Link href={record.url} target="_blank" rel="noopener noreferrer">{value}</Link> },
    { title: "수집 상태", width: 180, render: (_, record) => <><Tag color={["partial", "deferred"].includes(record.status) ? "warning" : record.status === "error" ? "error" : undefined}>{statusLabel[record.status]}</Tag>{record.failureCode && <Text type="secondary">{failureLabel[record.failureCode] ?? "확인 필요"}</Text>}</> },
    { title: "저장", dataIndex: "recordCount", width: 85, render: (value) => `${value}건` },
    { title: "최근 시도", dataIndex: "lastAttemptAt", width: 180, render: formatNewsTime },
    { title: "최근 전체 성공", dataIndex: "lastSuccessAt", width: 180, render: formatNewsTime },
    { title: "다음 시도 가능", dataIndex: "nextAttemptAt", width: 180, render: formatNewsTime },
  ];
  const onTableChange: TableProps<BrandNewsRecord>["onChange"] = (pagination, _, sorter, extra) => {
    const sort = Array.isArray(sorter) ? sorter[0] : sorter;
    filters.update({ newsPage: String(extra.action === "sort" ? 1 : pagination.current ?? 1), newsSort: String(sort.columnKey ?? filters.sort), newsDirection: sort.order ?? "descend" });
  };
  const oldSnapshot = data && Date.parse(data.fetchedAt) - Date.parse(data.snapshot.generatedAt) > 24 * 3_600_000;
  return <>
    <AdminPageHeader title="브랜드 소식" action={<Button icon={<ReloadOutlined />} loading={loading} onClick={() => void refresh()}>새로고침</Button>} />
    {error && <Alert className={styles.notice} type="error" showIcon title={error} action={<Button size="small" onClick={() => void refresh()} disabled={loading}>다시 시도</Button>} />}
    {data?.stale && <Alert className={styles.notice} type="warning" showIcon title="최신 데이터 조회 실패 · 이전 저장본 표시 중" />}
    {oldSnapshot && <Alert className={styles.notice} type="warning" showIcon title="24시간 이상 갱신되지 않은 데이터" />}
    <Card className={`content-card table-card ${styles.card}`}>
      <Tabs activeKey={filters.tab} onChange={(value) => filters.update({ newsTab: value })} items={[
        { key: "posts", label: "소식 목록", children: <>
          <div className={styles.filters}>
            <Select className={styles.brand} aria-label="브랜드 필터" placeholder="브랜드" disabled={!data} value={data ? activeBrand : undefined} options={[{ value: "all", label: "전체 브랜드" }, ...(data?.snapshot.sources ?? []).map((source) => ({ value: source.brandId, label: source.brandName }))]} onChange={(value) => filters.update({ newsBrand: value, newsPage: "1" })} />
            <Input.Search className={styles.search} value={filters.query} onChange={(event) => filters.update({ newsQuery: event.target.value, newsPage: "1" }, true)} allowClear placeholder="브랜드·소식 검색" aria-label="브랜드 소식 검색" />
            <Button type="text" icon={<ReloadOutlined />} disabled={filters.brand === "all" && !filters.query} onClick={() => filters.update({ newsBrand: "", newsQuery: "", newsPage: "1" })}>초기화</Button>
          </div>
          <div className={styles.summary} aria-live="polite"><Text strong>{loading && !data ? "불러오는 중…" : `${records.length}건`}</Text><Text type="secondary">저장본 갱신 {formatNewsTime(data?.snapshot.generatedAt ?? null)}</Text></div>
          <Table<BrandNewsRecord> rowKey="id" size="small" columns={columns} dataSource={records} loading={loading} onChange={onTableChange} scroll={{ x: 1080 }} sortDirections={["descend", "ascend", "descend"]} pagination={{ pageSize: PAGE_SIZE, current: currentPage, showSizeChanger: false, showTotal: (total) => `총 ${total}건` }} locale={{ emptyText: loading && !data ? <Text>불러오는 중…</Text> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={error ? "데이터를 불러오지 못했습니다." : filters.query || filters.brand !== "all" ? "검색 결과가 없습니다." : "수집된 소식이 없습니다."} /> }} />
        </> },
        { key: "sources", label: "수집 상태", children: <Table<BrandNewsSource> rowKey="key" size="small" columns={sourceColumns} dataSource={data?.snapshot.sources ?? []} loading={loading} pagination={false} scroll={{ x: 1080 }} expandable={{ rowExpandable: (record) => record.failedPosts.length > 0,
          expandedRowRender: (record) => <div className={styles.failures}>{record.failedPosts.map((failure) => <div className={styles.failure} key={failure.url}>
            <Link href={failure.url} target="_blank" rel="noopener noreferrer">실패 게시물 원문</Link><Text>{failure.stage === "navigate" ? "페이지 이동" : failure.stage === "metadata" ? "메타데이터 읽기" : "파싱"} · {failureLabel[failure.code] ?? "확인 필요"} · {failure.attempts}회</Text><Tag>{failure.status === "needs-review" ? "수동 확인 필요" : "재시도 대기"}</Tag><Text type="secondary">{formatNewsTime(failure.nextAttemptAt)}</Text>
          </div>)}</div> }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={error ? "데이터를 불러오지 못했습니다." : "수집 상태가 없습니다."} /> }} /> },
      ]} />
    </Card>
  </>;
}
