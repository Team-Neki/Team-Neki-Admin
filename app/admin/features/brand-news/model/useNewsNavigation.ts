import { useEffect, useRef } from "react";

export function useNewsNavigation(detailId: string, title: string | undefined, update: (values: Record<string, string>) => void) {
  const origin = useRef<{ id: string; y: number } | null>(null);
  useEffect(() => {
    document.title = `${detailId ? title ?? "소식 상세" : "브랜드 소식"} — Neki Admin`;
    if (detailId) { window.scrollTo(0, 0); return; }
    if (!origin.current) return;
    const { id, y } = origin.current;
    const frame = requestAnimationFrame(() => {
      document.querySelector<HTMLAnchorElement>(`[data-news-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
      window.scrollTo(0, y);
    });
    return () => cancelAnimationFrame(frame);
  }, [detailId, title]);
  return {
    open(id: string) { origin.current = { id, y: window.scrollY }; update({ newsId: id }); },
    back() { update({ newsId: "" }); },
  };
}
