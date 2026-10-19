import ReloadOutlined from "@ant-design/icons/ReloadOutlined";
import { Alert, Button, Empty, Image, Spin, Typography } from "antd";
import type { InstagramStoriesSnapshot } from "../../../types";
import { formatInstagramMetric } from "../model/instagram-metrics";
import { useInstagramContent } from "../model/useInstagramContent";
import styles from "./InstagramMetricsScreen.module.css";

export function InstagramStoriesPanel({ onSelect }: { onSelect: (id: string) => void }) {
  const { data, loading, error, remaining, refresh, loadMore } = useInstagramContent<InstagramStoriesSnapshot>("/api/instagram/stories");
  const stories = data?.stories ?? [];
  return <section aria-label="현재 스토리" aria-busy={loading}>
    <div className={styles.storyToolbar}><Typography.Text type="secondary">현재 게시 중 · 24시간</Typography.Text><Button size="small" icon={<ReloadOutlined />} loading={loading} disabled={remaining > 0} onClick={refresh}>{remaining > 0 ? `${remaining}초 후 재조회` : "스토리 새로고침"}</Button></div>
    {error && <Alert className={styles.notice} type="error" showIcon title={error} />}
    {!!data?.warnings.length && <Alert className={styles.notice} type="warning" showIcon title={data.warnings.join(" ")} />}
    <Spin spinning={loading} description="스토리 조회 중"><div className={styles.storiesBody}>
      {stories.length ? <div className={styles.storyGrid}>{stories.map((story) => <article key={story.id} className={styles.storyCard}>
        <button type="button" className={styles.storyPreview} onClick={() => onSelect(story.id)} aria-label={`${story.title} 상세 보기`}>
          {story.thumbnailUrl ? <Image src={story.thumbnailUrl} alt="" preview={false} styles={{ root: { width: "100%", height: "100%" }, image: { width: "100%", height: "100%", objectFit: "contain" } }} fallback="/icon.png" /> : <span>스토리 상세 보기</span>}
        </button>
        <div className={styles.storyInfo}><strong>{story.title}</strong><Typography.Text type="secondary">{new Date(story.expiresAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 게시 종료 예정</Typography.Text>
          <dl className={styles.storyMetrics}>{[["조회", story.views], ["도달", story.reach], ["답글", story.replies], ["공유", story.shares]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{formatInstagramMetric(value as number | null)}</dd></div>)}</dl>
        </div>
      </article>)}</div> : !loading && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={error ? "스토리를 불러오지 못했습니다." : "현재 게시 중인 스토리가 없습니다."} />}
    </div></Spin>
    {data?.nextCursor && <div className={styles.more}><Button onClick={() => loadMore(data.nextCursor!)} loading={loading} disabled={remaining > 0}>스토리 더 보기</Button></div>}
    {data && <Typography.Text type="secondary" className={styles.scope}>조회 {new Date(data.fetchedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</Typography.Text>}
  </section>;
}
