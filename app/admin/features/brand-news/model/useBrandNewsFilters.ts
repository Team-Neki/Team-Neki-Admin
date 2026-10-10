import { useSyncExternalStore } from "react";

const subscribe = (onChange: () => void) => {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
};
const read = () => window.location.search;
const readServer = () => "";

export function useBrandNewsFilters() {
  const search = useSyncExternalStore(subscribe, read, readServer);
  const params = new URLSearchParams(search);
  const parsedPage = Number(params.get("newsPage"));
  return {
    query: params.get("newsQuery") ?? "",
    brand: params.get("newsBrand") ?? "all",
    tab: params.get("newsTab") === "sources" ? "sources" : "posts",
    page: Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1,
    sort: params.get("newsSort") === "brand" ? "brand" : "published",
    direction: params.get("newsDirection") === "ascend" ? "ascend" as const : "descend" as const,
    update(values: Record<string, string>, replace = false) {
      const url = new URL(window.location.href);
      for (const [key, value] of Object.entries(values)) {
        if (value) url.searchParams.set(key, value);
        else url.searchParams.delete(key);
      }
      window.history[replace ? "replaceState" : "pushState"]({}, "", url);
      window.dispatchEvent(new PopStateEvent("popstate"));
    },
  };
}
