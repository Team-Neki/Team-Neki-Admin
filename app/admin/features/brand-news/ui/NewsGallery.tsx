import { useId, useState } from "react";
import ExpandOutlined from "@ant-design/icons/ExpandOutlined";
import { Button, Modal, Segmented, Typography } from "antd";
import { NewsImage } from "./NewsImage";
import styles from "./BrandNewsScreen.module.css";

const fitOptions = [{ label: "전체 보기", value: "contain" as const }, { label: "가로 맞춤", value: "width" as const }];

export function NewsGallery({ images, title }: { images: string[]; title: string }) {
  const name = useId();
  const [selected, setSelected] = useState(0);
  const [fit, setFit] = useState<"contain" | "width">("contain");
  const [expanded, setExpanded] = useState(false);
  const current = Math.max(0, Math.min(selected, images.length - 1));
  const src = images[current];
  const viewer = (large = false) => <>
    <div className={styles.galleryToolbar}>
      <Segmented<"contain" | "width"> name={`${name}-${large ? "large" : "inline"}`} size="small" aria-label="사진 표시 방식" options={fitOptions} value={fit} disabled={!src} onChange={setFit} />
      {!large && <Button size="small" icon={<ExpandOutlined />} disabled={!src} onClick={() => setExpanded(true)}>확대 보기</Button>}
    </div>
    <div key={current} className={`${styles.hero} ${large ? styles.expandedHero : ""}`} tabIndex={fit === "width" ? 0 : undefined} role="region" aria-label={large ? "확대 사진" : "현재 사진"}>
      <NewsImage key={src ?? "missing"} src={src} alt={`${title} · 사진 ${current + 1}`} fit={fit} eager retry />
    </div>
    {images.length > 1 && <div className={styles.galleryControls}>
      <Button size="small" disabled={current === 0} onClick={() => setSelected(current - 1)}>이전 사진</Button>
      <Typography.Text aria-live="polite">{current + 1} / {images.length}</Typography.Text>
      <Button size="small" disabled={current === images.length - 1} onClick={() => setSelected(current + 1)}>다음 사진</Button>
    </div>}
  </>;
  return <section className={styles.gallery} aria-label="소식 사진">
    {viewer()}
    {images.length > 1 && <div className={styles.thumbnails} aria-label="사진 선택">{images.map((image, index) => <button type="button" key={image} className={styles.thumbnail} aria-label={`사진 ${index + 1} 보기`} aria-pressed={index === current} onClick={() => setSelected(index)}><NewsImage src={image} alt="" /></button>)}</div>}
    <Modal open={expanded} title="사진 확대" centered width="calc(100vw - 32px)" style={{ maxWidth: 1120 }} footer={null} destroyOnHidden focusable={{ trap: true, focusTriggerAfterClose: true }} closable={{ "aria-label": "확대 보기 닫기" }} onCancel={() => setExpanded(false)}>
      {viewer(true)}
    </Modal>
  </section>;
}
