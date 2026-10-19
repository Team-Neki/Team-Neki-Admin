import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Dayjs } from "dayjs";
import type { InstagramMetricsSnapshot } from "../../../types";
import { fetchInstagramMetrics, InstagramRequestError } from "../api/instagram-api";
import { instagramRangeFromSearch } from "./instagram-metrics";

const subscribe = (listener: () => void) => {
  window.addEventListener("popstate", listener);
  return () => window.removeEventListener("popstate", listener);
};
const getSearch = () => window.location.search;
const getServerSearch = () => "";
type State = { key: string; data?: InstagramMetricsSnapshot; loading: boolean; loadingMore: boolean; error?: string };

export function useInstagramMetrics() {
  const search = useSyncExternalStore(subscribe, getSearch, getServerSearch);
  const contentTab = new URLSearchParams(search).get("igTab") === "stories" ? "stories" : "feed";
  const range = useMemo(() => instagramRangeFromSearch(search), [search]);
  const startDate = range[0].format("YYYY-MM-DD");
  const endDate = range[1].format("YYYY-MM-DD");
  const key = `${startDate}:${endDate}`;
  const [state, setState] = useState<State>({ key: "", loading: true, loadingMore: false });
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const request = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const busy = useRef(false);

  const load = useCallback(async (cursor?: string, refresh = false) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const current = ++sequence.current;
    busy.current = true;
    setState((previous) => ({ key, data: previous.key === key ? previous.data : undefined, loading: !cursor, loadingMore: !!cursor }));
    const timer = window.setTimeout(() => controller.abort("timeout"), 120_000);
    try {
      const data = await fetchInstagramMetrics(startDate, endDate, cursor, controller.signal, refresh);
      if (current !== sequence.current || controller.signal.aborted) return;
      setState((previous) => ({ key, loading: false, loadingMore: false, data: {
        ...data,
        posts: cursor && previous.key === key ? [...new Map([...(previous.data?.posts ?? []), ...data.posts].map((post) => [post.id, post])).values()] : data.posts,
      } }));
    } catch (error) {
      if (current !== sequence.current || (controller.signal.aborted && controller.signal.reason !== "timeout")) return;
      if (error instanceof InstagramRequestError && error.retryAfter > 0) setCooldownUntil(Date.now() + error.retryAfter * 1000);
      setState((previous) => ({ ...previous, loading: false, loadingMore: false,
        error: controller.signal.reason === "timeout" ? "조회 시간이 초과되었습니다. 다시 시도해 주세요." : error instanceof Error ? error.message : "Instagram 지표를 불러오지 못했습니다.",
      }));
    } finally {
      window.clearTimeout(timer);
      if (current === sequence.current) busy.current = false;
    }
  }, [key, startDate, endDate]);

  useEffect(() => {
    void load();
    return () => { sequence.current += 1; request.current?.abort(); busy.current = false; };
  }, [load]);
  useEffect(() => {
    const update = () => setCooldownRemaining(Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000)));
    update();
    if (!cooldownUntil) return;
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownUntil]);

  const setRange = useCallback((next: [Dayjs, Dayjs]) => {
    const url = new URL(window.location.href);
    url.searchParams.set("igStart", next[0].format("YYYY-MM-DD"));
    url.searchParams.set("igEnd", next[1].format("YYYY-MM-DD"));
    window.history.pushState({}, "", url);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, []);
  const refresh = () => { if (!busy.current && Date.now() >= cooldownUntil) void load(undefined, true); };
  const setContentTab = (tab: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("igTab", tab === "stories" ? "stories" : "feed");
    window.history.pushState({}, "", url);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };
  const loadMore = () => { if (!busy.current && state.data?.nextCursor && Date.now() >= cooldownUntil) void load(state.data.nextCursor); };
  return { range, setRange, data: state.key === key ? state.data : undefined, loading: state.key !== key || state.loading,
    loadingMore: state.loadingMore, error: state.key === key ? state.error : undefined, cooldownRemaining, refresh, loadMore, contentTab, setContentTab };
}
