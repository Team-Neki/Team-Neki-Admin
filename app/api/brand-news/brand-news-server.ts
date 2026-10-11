import "server-only";
import { readFile } from "node:fs/promises";
import type { BrandNewsResponse } from "../../admin/types";
import { validateBrandNews } from "./brand-news-validation";

const DATA_URL = "https://raw.githubusercontent.com/Team-Neki/Team-Neki-Admin/data/brand-news/brand-news.json";
const TTL = 5 * 60_000;
const MAX_BYTES = 5_000_000;
let cached: BrandNewsResponse | undefined;
let expiresAt = 0;
let pending: Promise<BrandNewsResponse> | undefined;
let failedUntil = 0;

async function loadSnapshot(): Promise<BrandNewsResponse> {
  let payload: string;
  // Explicit server-owned local adapter for development/tests; never a request parameter.
  if (process.env.BRAND_NEWS_DATA_FILE) payload = await readFile(process.env.BRAND_NEWS_DATA_FILE, "utf8");
  else {
    const response = await fetch(DATA_URL, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!response.ok) { await response.body?.cancel(); throw new Error("Shared snapshot unavailable"); }
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Empty shared snapshot");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) { await reader.cancel(); throw new Error("Shared snapshot too large"); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    payload = Buffer.concat(chunks).toString("utf8");
  }
  if (Buffer.byteLength(payload) > MAX_BYTES) throw new Error("Shared snapshot too large");
  return { snapshot: validateBrandNews(JSON.parse(payload)), fetchedAt: new Date().toISOString(), stale: false };
}

export async function readBrandNews(): Promise<BrandNewsResponse> {
  if (cached && Date.now() < expiresAt) return cached;
  if (Date.now() < failedUntil) throw new Error("Shared snapshot temporarily unavailable");
  if (pending) return pending;
  pending = loadSnapshot().then((result) => { cached = result; expiresAt = Date.now() + TTL; return result; }).catch((error) => {
    // A failed refresh remains visible; stored data is never represented as fresh.
    if (cached) { cached = { ...cached, stale: true }; expiresAt = Date.now() + 30_000; return cached; }
    failedUntil = Date.now() + 30_000;
    throw error;
  }).finally(() => { pending = undefined; });
  return pending;
}
