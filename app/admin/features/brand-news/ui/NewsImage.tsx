import { useState } from "react";
import PictureOutlined from "@ant-design/icons/PictureOutlined";
import ReloadOutlined from "@ant-design/icons/ReloadOutlined";
import { Button, Spin } from "antd";
import styles from "./BrandNewsScreen.module.css";

export function NewsImage({ src, alt, fit = "contain", eager = false, retry = false }: {
  src?: string; alt: string; fit?: "contain" | "width"; eager?: boolean; retry?: boolean;
}) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  return <div className={styles.image} data-fit={fit} aria-busy={!!src && state === "loading"}>
    {src && state !== "error"
      // Public source URLs may expire. Show an honest failure, never a substitute photograph.
      ? <>
        {/* Retry the exact signed URL; changing its query can invalidate the signature. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={attempt} src={src} alt={alt} loading={eager ? "eager" : "lazy"} decoding="async" referrerPolicy="no-referrer" onLoad={() => setState("ready")} onError={() => setState("error")} />
        {state === "loading" && <span className={styles.imageLoading} role="status" aria-label="이미지 불러오는 중"><Spin size="small" /></span>}
      </>
      : <span className={styles.imageMissing} role={retry ? "status" : undefined}><PictureOutlined aria-hidden /><span>{src ? "이미지를 불러오지 못했습니다" : "이미지 없음"}</span>
        {src && retry && <Button size="small" icon={<ReloadOutlined />} onClick={() => { setAttempt(attempt + 1); setState("loading"); }}>다시 시도</Button>}
      </span>}
  </div>;
}
