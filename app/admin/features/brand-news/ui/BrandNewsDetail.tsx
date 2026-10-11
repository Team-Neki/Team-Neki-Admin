import { useEffect, useRef } from "react";
import ArrowLeftOutlined from "@ant-design/icons/ArrowLeftOutlined";
import ExportOutlined from "@ant-design/icons/ExportOutlined";
import { Button, Card, Tag, Typography } from "antd";
import type { BrandNewsRecord } from "../../../types";
import { categoryLabel, formatNewsTime } from "../model/brand-news";
import { newsSourceLabel } from "../model/news-source";
import { NewsGallery } from "./NewsGallery";
import styles from "./BrandNewsScreen.module.css";

const { Title, Text } = Typography;

export function BrandNewsDetail({ record, onBack }: { record: BrandNewsRecord; onBack: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  return <>
    <div className={styles.detailNavigation}>
      <Button icon={<ArrowLeftOutlined />} onClick={onBack}>목록으로</Button>
      <Typography.Link className={styles.originalLink} href={record.url} target="_blank" rel="noopener noreferrer"><ExportOutlined />원문 보기</Typography.Link>
    </div>
    <Card className={`content-card ${styles.detailCard}`}>
      <div className={styles.detailLayout}>
        <NewsGallery images={record.imageUrls} title={record.title} />
        <section className={styles.detailContent}>
          <div className={styles.detailMeta}><Text strong>{record.brandName}</Text><Tag>{categoryLabel[record.category]}</Tag></div>
          <h1 ref={heading} tabIndex={-1} className={styles.detailTitle}>{record.title}</h1>
          <dl className={styles.facts}>
            <div><dt>수집처</dt><dd>{newsSourceLabel(record.url)}</dd></div>
            <div><dt>게시일</dt><dd>{record.publishedOn ?? "미확인"}</dd></div>
            <div><dt>게시된 기간</dt><dd>{record.startsOn || record.endsOn ? `${record.startsOn ?? "미확인"} ~ ${record.endsOn ?? "미확인"}` : "미확인"}</dd></div>
            <div><dt>검토</dt><dd>{record.reviewStatus === "approved" ? "검토 완료" : record.reviewStatus === "rejected" ? "제외" : "검토 대기"}</dd></div>
            <div><dt>최근 수집</dt><dd>{formatNewsTime(record.observedAt)}</dd></div>
          </dl>
          {record.excerpt && <div className={styles.caption}><Title level={2}>게시 내용</Title><p>{record.excerpt}</p></div>}
        </section>
      </div>
    </Card>
  </>;
}
