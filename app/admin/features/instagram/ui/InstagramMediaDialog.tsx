import { useState } from "react";
import { Alert, Button, Empty, Image, Modal, Spin, Typography } from "antd";
import type { InstagramMediaDetail } from "../../../types";
import { useInstagramContent } from "../model/useInstagramContent";
import { formatInstagramMetric } from "../model/instagram-metrics";
import styles from "./InstagramMetricsScreen.module.css";

export function InstagramMediaDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, loading, error, remaining, refresh } = useInstagramContent<InstagramMediaDetail>(id ? `/api/instagram/media/${id}` : null);
  const [selection, setSelection] = useState({ id, index: 0 });
  const index = selection.id === id ? Math.min(selection.index, Math.max(0, (data?.assets.length ?? 1) - 1)) : 0;
  const media = data?.assets[index];
  return <Modal open={!!id} title="콘텐츠 상세" width={920} centered footer={null} destroyOnHidden onCancel={onClose}
    classNames={{ body: styles.detailBody }} focusable={{ trap: true, focusTriggerAfterClose: true }} closable={{ "aria-label": "콘텐츠 상세 닫기" }}>
    {error && <Alert type="error" showIcon title={error} action={<Button size="small" onClick={refresh} disabled={loading || remaining > 0}>{remaining > 0 ? `${remaining}초 후 재시도` : "다시 시도"}</Button>} />}
    {!!data?.warnings.length && <Alert type="warning" showIcon title={data.warnings.join(" ")} />}
    <Spin spinning={loading} description="콘텐츠 조회 중"><div className={styles.mediaViewer}>
      {media?.url ? media.type === "video"
        ? <video key={media.url} src={media.url} poster={media.thumbnailUrl ?? undefined} controls playsInline preload="metadata" aria-label="Instagram 콘텐츠 영상" />
        : <Image key={media.url} src={media.url} alt={`Instagram 콘텐츠 사진 ${index + 1}`} preview={false} styles={{ image: { objectFit: "contain", maxHeight: "55dvh", width: "100%" }, root: { width: "100%" } }} fallback="/icon.png" />
        : !loading && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={error ? "콘텐츠를 불러오지 못했습니다." : "미리보기를 제공하지 않는 콘텐츠입니다."} />}
    </div></Spin>
    {data && <>
      {data.assets.length > 1 && <div className={styles.galleryControls}>
        <Button size="small" disabled={index === 0} onClick={() => setSelection({ id, index: index - 1 })}>이전 사진</Button>
        <Typography.Text aria-live="polite">{index + 1} / {data.assets.length}</Typography.Text>
        <Button size="small" disabled={index === data.assets.length - 1} onClick={() => setSelection({ id, index: index + 1 })}>다음 사진</Button>
      </div>}
      <div className={styles.detailMeta}><Typography.Text>@{data.username}</Typography.Text><Typography.Text type="secondary">{new Date(data.publishedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</Typography.Text></div>
      {(data.likes !== null || data.comments !== null) && <Typography.Text>좋아요 {formatInstagramMetric(data.likes)} · 댓글 {formatInstagramMetric(data.comments)}</Typography.Text>}
      {data.caption && <p className={styles.caption}>{data.caption}</p>}
      {data.permalink && <a className={styles.originalLink} href={data.permalink} target="_blank" rel="noopener noreferrer">Instagram 원본 보기</a>}
    </>}
  </Modal>;
}
