import type { MouseEvent } from "react";
import { Empty, Pagination, Spin, Tag, Typography } from "antd";
import type { BrandNewsRecord } from "../../../types";
import { categoryLabel } from "../model/brand-news";
import { newsSourceLabel } from "../model/news-source";
import { NewsImage } from "./NewsImage";
import styles from "./BrandNewsScreen.module.css";

export const NEWS_PAGE_SIZE = 30;
const { Text } = Typography;

export function BrandNewsGrid({ records, loading, error, filtered, page, search, onPage, onOpen }: {
  records: BrandNewsRecord[]; loading: boolean; error?: string; filtered: boolean; page: number; search: string;
  onPage: (page: number) => void; onOpen: (id: string) => void;
}) {
  const open = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onOpen(id);
  };
  return <Spin spinning={loading} description="불러오는 중…">
    <div className={styles.gridRegion} aria-busy={loading}>
      {records.length ? <ul className={styles.grid} aria-label="브랜드 소식 목록">{records.slice((page - 1) * NEWS_PAGE_SIZE, page * NEWS_PAGE_SIZE).map((record) => {
        const params = new URLSearchParams(search);
        params.set("view", "brand-news");
        params.set("newsId", record.id);
        return <li key={record.id}><a data-news-id={record.id} className={styles.newsCard} href={`?${params}`} onClick={(event) => open(event, record.id)}>
          <div className={styles.cover}><NewsImage key={record.imageUrls[0] ?? record.id} src={record.imageUrls[0]} alt={`${record.brandName} · ${record.title}`} />{record.imageUrls.length > 1 && <span className={styles.photoCount}>사진 {record.imageUrls.length}장</span>}</div>
          <div className={styles.newsBody}><div className={styles.newsMeta}><Text strong>{record.brandName}</Text><Tag>{categoryLabel[record.category]}</Tag></div><Text type="secondary" className={styles.sourceLabel}>{newsSourceLabel(record.url)}</Text><h2>{record.title}</h2><div className={styles.newsFooter}><time dateTime={record.publishedOn ?? undefined}>{record.publishedOn ?? "게시일 미확인"}</time><span>{record.reviewStatus === "approved" ? "검토 완료" : record.reviewStatus === "rejected" ? "제외" : "검토 대기"}</span></div></div>
        </a></li>;
      })}</ul> : <div className={styles.empty}>{!loading && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={error ? "데이터를 불러오지 못했습니다." : filtered ? "검색 결과가 없습니다." : "수집된 소식이 없습니다."} />}</div>}
      {!!records.length && <Pagination className={styles.pagination} pageSize={NEWS_PAGE_SIZE} current={page} total={records.length} showSizeChanger={false} responsive showTotal={(total, range) => `${range[0]}–${range[1]} / ${total}건`} onChange={onPage} />}
    </div>
  </Spin>;
}
