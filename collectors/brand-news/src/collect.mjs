import { selectedPages, selectedBrands } from "./collection-scope.mjs";
import { parsePage } from "./parse.mjs";
import { load } from "cheerio";

const MAX_HTML_BYTES = 2_000_000;
const MAX_FETCH_ATTEMPTS = 3;

const isRetryable = (error) => error?.name === "TimeoutError"
  || error?.name === "AbortError"
  || error?.name === "TypeError"
  || /HTTP (?:429|500|502|503|504)\b/.test(error?.message ?? "");

export async function fetchHtmlWithRetry(url, fetchImpl = fetch, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))) {
  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt += 1) {
    try {
      return await fetchHtml(url, fetchImpl);
    } catch (error) {
      if (!isRetryable(error) || error.code === "rate-limited" || attempt === MAX_FETCH_ATTEMPTS || error.retryAfterMs > 30_000) throw error;
      await wait(Math.max(1_000 * attempt, error.retryAfterMs ?? 0));
    }
  }
}

export async function fetchHtml(url, fetchImpl = fetch) {
  if (new URL(url).protocol !== "https:") throw new Error("HTTPS source required");
  const response = await fetchImpl(url, {
    headers: { "User-Agent": "NekiFrameResearch/0.1 (public-page-monitor)" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`);
    error.code = response.status === 429 ? "rate-limited" : response.status === 401 || response.status === 403 ? "access-denied" : "http-error";
    const retryAfter = response.headers.get("retry-after");
    if (retryAfter) error.retryAfterMs = /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : Math.max(0, Date.parse(retryAfter) - Date.now()) || 0;
    await response.body?.cancel();
    throw error;
  }
  if (response.url && new URL(response.url).protocol !== "https:") throw new Error("Insecure source redirect");
  const contentType = response.headers.get("content-type") ?? "";
  if (!/^(?:text\/html|text\/xml|application\/(?:rss\+xml|xml))\b/i.test(contentType)) throw new Error(`Unexpected content type: ${contentType}`);
  const declaredSize = Number(response.headers.get("content-length") ?? 0);
  if (declaredSize > MAX_HTML_BYTES) {
    await response.body?.cancel();
    throw new Error("HTML exceeds size limit");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty source response");
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_HTML_BYTES) {
        await reader.cancel();
        throw new Error("HTML exceeds size limit");
      }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString("utf8");
}

export async function collectCandidates({ pages = selectedPages, fetchImpl = fetch, browserFetchImpl, previous, observedAt = new Date().toISOString() } = {}) {
  const candidates = [];
  const diagnostics = [];
  // Resolve the transport once, before loading browser dependencies, which may
  // wrap the runtime's global fetch. Injected test fetches stay HTTP-only.
  const usePublicBrowser = fetchImpl === fetch;
  for (const page of pages) {
    try {
      const earlier = previous?.diagnostics.find((item) => item.sourceKey === page.key);
      // Older runs only counted failed details. Recheck the visible list once to
      // identify those URLs instead of silently declaring all cached posts valid.
      const legacyUnknownFailures = Number(earlier?.detailFailures ?? 0) > 0 && !earlier?.failedPosts?.length;
      const html = page.parser === "instagram-public" && usePublicBrowser
        ? await (browserFetchImpl ?? (async (source, options) => (await import("./instagram-browser.mjs")).fetchPublicInstagramHtml(source, options)))(page, {
          observedAt, knownRecords: legacyUnknownFailures ? [] : previous?.records.filter((record) => record.sourceKey === page.key) ?? [],
          failedPosts: earlier?.failedPosts ?? [],
        })
        : await fetchHtmlWithRetry(page.url, fetchImpl);
      const parsed = parsePage(html, page);
      const main = load(html)("main[data-source-account]");
      const discoveryOnly = page.parser === "instagram-public" && main.attr("data-selected") === "0" && Number(main.attr("data-listed")) > 0;
      if (parsed.length === 0 && !discoveryOnly) throw Object.assign(new Error("No records found; source layout may have changed"), { code: "layout-changed" });
      const failedPosts = page.parser === "instagram-public" ? JSON.parse(main.attr("data-post-failures") ?? "[]") : [];
      candidates.push(...parsed.map((item) => ({ ...item, observedAt })));
      const readCount = Number(html.match(/data-read="(\d+)"/)?.[1] ?? parsed.length);
      const selectedCount = Number(html.match(/data-selected="(\d+)"/)?.[1] ?? readCount);
      const detailFailures = Number(html.match(/data-failed="(\d+)"/)?.[1] ?? 0) + Math.max(0, readCount - parsed.length);
      const partial = page.parser === "instagram-public" && (detailFailures > 0 || parsed.length < selectedCount || failedPosts.length > 0);
      diagnostics.push({ sourceKey: page.key, status: partial ? "partial" : "ok", count: parsed.length,
        ...(partial ? { failureCode: html.match(/data-failure-code="([a-z-]+)"/)?.[1] ?? "partial-metadata",
          retryAfterMs: Number(html.match(/data-retry-after-ms="(\d+)"/)?.[1] ?? 0) } : { lastSuccessAt: observedAt }),
        ...(page.parser === "instagram-public" ? { listedPosts: Number(html.match(/data-listed="(\d+)"/)?.[1] ?? 0),
          selectedCount, attemptedDetails: Number(html.match(/data-attempted="(\d+)"/)?.[1] ?? readCount + detailFailures), detailFailures, failedPosts } : {}) });
    } catch (error) {
      diagnostics.push({ sourceKey: page.key, status: error?.sourceDiscovered && !error.stopSource ? "partial" : "error", failureCode: error?.code ?? "fetch-failed", message: error instanceof Error ? error.message : String(error), retryAfterMs: error?.retryAfterMs ?? null,
        failedPosts: error?.failedPosts ?? previous?.diagnostics.find((item) => item.sourceKey === page.key)?.failedPosts ?? [] });
    }
  }
  const unique = [...new Map(candidates.map((item) => [item.id, item])).values()];
  return { schemaVersion: 1, observedAt, candidates: unique, diagnostics, coverage: selectedBrands };
}
