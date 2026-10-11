"use client";

import ReloadOutlined from "@ant-design/icons/ReloadOutlined";
import { Alert, Button, Card, Empty, Input, Select, Spin, Table, Tabs, Tag, Typography, type TableProps } from "antd";
import type { BrandNewsSource } from "../../../types";
import { AdminPageHeader } from "../../../shared/ui/AdminPageHeader";
import { categoryOptions, failureLabel, filterNews, formatNewsTime, statusLabel } from "../model/brand-news";
import { useBrandNews } from "../model/useBrandNews";
import { useBrandNewsFilters } from "../model/useBrandNewsFilters";
import { useNewsNavigation } from "../model/useNewsNavigation";
import { BrandNewsDetail } from "./BrandNewsDetail";
import { BrandNewsGrid, NEWS_PAGE_SIZE } from "./BrandNewsGrid";
import styles from "./BrandNewsScreen.module.css";

const { Text, Link } = Typography;

export function BrandNewsScreen() {
  const { data, loading, error, refresh } = useBrandNews();
  const filters = useBrandNewsFilters();
  const activeBrand = data?.snapshot.sources.some((source) => source.brandId === filters.brand) ? filters.brand : "all";
  const records = filterNews(data?.snapshot.records ?? [], { ...filters, brand: activeBrand });
  const currentPage = Math.min(filters.page, Math.max(1, Math.ceil(records.length / NEWS_PAGE_SIZE)));
  const detail = data?.snapshot.records.find((record) => record.id === filters.detailId);
  const navigation = useNewsNavigation(filters.detailId, detail?.title, filters.update);
  const sourceColumns: TableProps<BrandNewsSource>["columns"] = [
    { title: "브랜드", dataIndex: "brandName", width: 135, render: (value, record) => <Link href={record.url} target="_blank" rel="noopener noreferrer">{value}</Link> },
    { title: "수집 상태", width: 180, render: (_, record) => <><Tag color={["partial", "deferred"].includes(record.status) ? "warning" : record.status === "error" ? "error" : undefined}>{statusLabel[record.status]}</Tag>{record.failureCode && <Text type="secondary">{failureLabel[record.failureCode] ?? "확인 필요"}</Text>}</> },
    { title: "저장", dataIndex: "recordCount", width: 85, render: (value) => `${value}건` },
    { title: "최근 시도", dataIndex: "lastAttemptAt", width: 180, render: formatNewsTime },
    { title: "최근 전체 성공", dataIndex: "lastSuccessAt", width: 180, render: formatNewsTime },
    { title: "다음 시도 가능", dataIndex: "nextAttemptAt", width: 180, render: formatNewsTime },
  ];
  const oldSnapshot = data && Date.parse(data.fetchedAt) - Date.parse(data.snapshot.generatedAt) > 24 * 3_600_000;
  return <>
    {!filters.detailId && <AdminPageHeader title="브랜드 소식" action={<Button icon={<ReloadOutlined />} loading={loading} onClick={() => void refresh()}>새로고침</Button>} />}
    {error && <Alert className={styles.notice} type="error" showIcon title={error} action={<Button size="small" onClick={() => void refresh()} disabled={loading}>다시 시도</Button>} />}
    {data?.stale && <Alert className={styles.notice} type="warning" showIcon title="최신 데이터 조회 실패 · 이전 저장본 표시 중" />}
    {oldSnapshot && <Alert className={styles.notice} type="warning" showIcon title="24시간 이상 갱신되지 않은 데이터" />}
    {filters.detailId ? detail ? <BrandNewsDetail key={detail.id} record={detail} onBack={navigation.back} /> : <Card className="content-card"><Spin spinning={loading}><div className={styles.empty}>{!loading && <Empty description={error ? "소식을 불러오지 못했습니다." : "소식을 찾을 수 없습니다."}><Button onClick={navigation.back}>목록으로</Button></Empty>}</div></Spin></Card> : <Card className={`content-card table-card ${styles.card}`}>
      <Tabs activeKey={filters.tab} onChange={(value) => filters.update({ newsTab: value })} items={[
        { key: "posts", label: "소식 목록", children: <>
          <div className={styles.filters}>
            <Select className={styles.brand} aria-label="브랜드 필터" placeholder="브랜드" disabled={!data} value={data ? activeBrand : undefined} options={[{ value: "all", label: "전체 브랜드" }, ...(data?.snapshot.sources ?? []).map((source) => ({ value: source.brandId, label: source.brandName }))]} onChange={(value) => filters.update({ newsBrand: value, newsPage: "1" })} />
            <Select className={styles.category} aria-label="카테고리 필터" value={filters.category} options={categoryOptions} disabled={!data} onChange={(value) => filters.update({ newsCategory: value === "all" ? "" : value, newsPage: "1" })} />
            <Input.Search className={styles.search} value={filters.query} onChange={(event) => filters.update({ newsQuery: event.target.value, newsPage: "1" }, true)} allowClear placeholder="브랜드·소식 검색" aria-label="브랜드 소식 검색" />
            <Select className={styles.sort} aria-label="소식 정렬" value={`${filters.sort}-${filters.direction}`} options={[{value:"published-descend",label:"게시일 최신순"},{value:"published-ascend",label:"게시일 오래된순"},{value:"brand-ascend",label:"브랜드 가나다순"},{value:"brand-descend",label:"브랜드 역순"}]} onChange={(value) => { const [newsSort, newsDirection] = value.split("-"); filters.update({newsSort, newsDirection, newsPage:"1"}); }} />
            <Button type="text" icon={<ReloadOutlined />} disabled={filters.brand === "all" && filters.category === "all" && !filters.query} onClick={() => filters.update({ newsBrand: "", newsCategory: "", newsQuery: "", newsPage: "1" })}>초기화</Button>
          </div>
          <div className={styles.summary} aria-live="polite"><Text strong>{loading && !data ? "불러오는 중…" : `${records.length}건`}</Text><Text type="secondary">저장본 갱신 {formatNewsTime(data?.snapshot.generatedAt ?? null)}</Text></div>
          <BrandNewsGrid records={records} loading={loading} error={error} filtered={!!filters.query || activeBrand !== "all" || filters.category !== "all"} page={currentPage} search={filters.search} onPage={(page) => filters.update({newsPage: String(page)})} onOpen={navigation.open} />
        </> },
        { key: "sources", label: "수집 상태", children: <Table<BrandNewsSource> rowKey="key" size="small" columns={sourceColumns} dataSource={data?.snapshot.sources ?? []} loading={loading} pagination={false} scroll={{ x: 1080 }} expandable={{ rowExpandable: (record) => record.failedPosts.length > 0,
          expandedRowRender: (record) => <div className={styles.failures}>{record.failedPosts.map((failure) => <div className={styles.failure} key={failure.url}>
            <Link href={failure.url} target="_blank" rel="noopener noreferrer">실패 게시물 원문</Link><Text>{failure.stage === "navigate" ? "페이지 이동" : failure.stage === "metadata" ? "메타데이터 읽기" : "파싱"} · {failureLabel[failure.code] ?? "확인 필요"} · {failure.attempts}회</Text><Tag>{failure.status === "needs-review" ? "수동 확인 필요" : "재시도 대기"}</Tag><Text type="secondary">{formatNewsTime(failure.nextAttemptAt)}</Text>
          </div>)}</div> }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={error ? "데이터를 불러오지 못했습니다." : "수집 상태가 없습니다."} /> }} /> },
      ]} />
    </Card>}
  </>;
}
