import { useCallback, useEffect, useRef, useState } from "react";
import type { InstagramMediaDetail, InstagramStoriesSnapshot } from "../../../types";
import { authenticatedFetch } from "../../../shared/api/authenticated-fetch";
import { InstagramRequestError } from "../api/instagram-api";

type Content = InstagramMediaDetail | InstagramStoriesSnapshot;
type State<T> = { key: string | null; data?: T; loading: boolean; error?: string };

/** Lazy read-only content requests; never poll or fetch carousel children for every row. */
export function useInstagramContent<T extends Content>(path: string | null) {
  const [state, setState] = useState<State<T>>({ key: null, loading: false });
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const request = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const busy = useRef(false);
  const load = useCallback(async (cursor?: string, refresh = false) => {
    if (!path) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const current = ++sequence.current;
    busy.current = true;
    setState((previous) => ({ key: path, data: previous.key === path ? previous.data : undefined, loading: true }));
    const timer = window.setTimeout(() => controller.abort("timeout"), 120_000);
    try {
      const params = new URLSearchParams();
      if (cursor) params.set("cursor", cursor);
      if (refresh) params.set("refresh", "1");
      const response = await authenticatedFetch(`${path}${params.size ? `?${params}` : ""}`, { signal: controller.signal, cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new InstagramRequestError(typeof data.message === "string" ? data.message : "콘텐츠를 불러오지 못했습니다.", Number(data.retryAfter) || 0);
      if (!Array.isArray(data.warnings) || (!Array.isArray(data.assets) && !Array.isArray(data.stories))) throw new InstagramRequestError("Instagram 응답을 확인할 수 없습니다.");
      if (controller.signal.aborted || current !== sequence.current) return;
      setState((previous) => {
        if (cursor && previous.key === path && previous.data && "stories" in previous.data) {
          data.stories = [...new Map([...previous.data.stories, ...data.stories].map((story) => [story.id, story])).values()];
        }
        return { key: path, data, loading: false };
      });
    } catch (error) {
      if (current !== sequence.current || (controller.signal.aborted && controller.signal.reason !== "timeout")) return;
      if (error instanceof InstagramRequestError && error.retryAfter > 0) setCooldownUntil(Date.now() + error.retryAfter * 1000);
      setState((previous) => ({ ...previous, loading: false, error: controller.signal.reason === "timeout" ? "조회 시간이 초과되었습니다. 다시 시도해 주세요." : error instanceof Error ? error.message : "콘텐츠를 불러오지 못했습니다." }));
    } finally {
      window.clearTimeout(timer);
      if (current === sequence.current) busy.current = false;
    }
  }, [path]);
  useEffect(() => {
    void load();
    return () => { sequence.current += 1; request.current?.abort(); busy.current = false; };
  }, [load]);
  useEffect(() => {
    const update = () => setRemaining(Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000)));
    update();
    if (!cooldownUntil) return;
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownUntil]);
  const refresh = () => { if (!busy.current && Date.now() >= cooldownUntil) void load(undefined, true); };
  const loadMore = (cursor: string) => { if (!busy.current && Date.now() >= cooldownUntil) void load(cursor); };
  return { data: state.key === path ? state.data : undefined, loading: !!path && (state.key !== path || state.loading), error: state.key === path ? state.error : undefined, remaining, refresh, loadMore };
}
