import { useCallback, useEffect, useRef, useState } from "react";
import type { BrandNewsResponse } from "../../../types";
import { fetchBrandNews } from "../api/brand-news-api";

export function useBrandNews() {
  const [data, setData] = useState<BrandNewsResponse>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const request = useRef<AbortController | null>(null);
  const load = useCallback((controller: AbortController) => {
    return fetchBrandNews(controller.signal).then((result) => {
      if (!controller.signal.aborted) setData(result);
    }).catch(() => {
      if (!controller.signal.aborted) setError("브랜드 소식을 불러오지 못했습니다.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
  }, []);
  const refresh = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError(undefined);
    await load(controller);
  }, [load]);
  useEffect(() => {
    const controller = new AbortController();
    request.current = controller;
    void load(controller);
    return () => request.current?.abort();
  }, [load]);
  return { data, loading, error, refresh };
}
