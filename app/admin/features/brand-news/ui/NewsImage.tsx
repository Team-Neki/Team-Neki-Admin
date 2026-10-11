import { useState } from "react";
import PictureOutlined from "@ant-design/icons/PictureOutlined";
import styles from "./BrandNewsScreen.module.css";

export function NewsImage({ src, alt, contain = false, eager = false }: { src?: string; alt: string; contain?: boolean; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  return <div className={`${styles.image} ${contain ? styles.contain : ""}`}>
    {src && !failed
      // Public source URLs may expire. Show an honest failure, never a substitute photograph.
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={src} alt={alt} loading={eager ? "eager" : "lazy"} decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      : <span className={styles.imageMissing}><PictureOutlined aria-hidden /><span>{src ? "이미지를 불러오지 못했습니다" : "이미지 없음"}</span></span>}
  </div>;
}
