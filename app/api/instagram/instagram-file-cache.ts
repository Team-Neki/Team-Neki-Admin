import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import type { InstagramMetricsSnapshot } from "../../admin/types";

const TTL_MS = 5 * 60_000;
const MAX_BYTES = 2 * 1_024 * 1_024;
const snapshotKeys = new Set(["source", "username", "startDate", "endDate", "fetchedAt", "followers", "reach", "likes", "views", "trend", "posts", "nextCursor", "warnings"]);
const postKeys = new Set(["id", "title", "mediaType", "thumbnailUrl", "permalink", "publishedAt", "views", "comments", "shares", "saves", "reach", "profileVisits"]);
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const numeric = (value: unknown) => value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
const instant = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const date = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value));
const cursor = (value: unknown) => value === null || (typeof value === "string" && /^[A-Za-z0-9_=.-]{1,2048}$/.test(value));

function safeUrl(value: unknown, image: boolean): boolean {
  if (value === null) return true;
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.searchParams.has("access_token") &&
      (image ? url.hostname.endsWith(".cdninstagram.com") || url.hostname.endsWith(".fbcdn.net")
        : ["instagram.com", "www.instagram.com"].includes(url.hostname));
  } catch { return false; }
}

function isSnapshot(value: unknown): value is InstagramMetricsSnapshot {
  const data = object(value);
  return Object.keys(data).every((key) => snapshotKeys.has(key)) && data.source === "instagram" &&
    typeof data.username === "string" && /^[A-Za-z0-9_.]+$/.test(data.username) &&
    date(data.startDate) && date(data.endDate) && data.startDate <= data.endDate && instant(data.fetchedAt) &&
    [data.followers, data.reach, data.likes, data.views].every(numeric) && cursor(data.nextCursor) &&
    Array.isArray(data.warnings) && data.warnings.length === 0 &&
    Array.isArray(data.trend) && data.trend.length <= 90 && data.trend.every((item) => {
      const point = object(item);
      return Object.keys(point).every((key) => ["date", "reach", "periodEndsAt"].includes(key)) &&
        date(point.date) && numeric(point.reach) && instant(point.periodEndsAt);
    }) && Array.isArray(data.posts) && data.posts.length <= 12 && data.posts.every((item) => {
      const post = object(item);
      return Object.keys(post).every((key) => postKeys.has(key)) && typeof post.id === "string" && /^\d+$/.test(post.id) &&
        typeof post.title === "string" && post.title.length <= 180 && ["게시물", "릴스", "캐러셀"].includes(String(post.mediaType)) &&
        instant(post.publishedAt) && safeUrl(post.thumbnailUrl, true) && safeUrl(post.permalink, false) &&
        [post.views, post.comments, post.shares, post.saves, post.reach, post.profileVisits].every(numeric);
    });
}

function cacheRoot() {
  const configured = process.env.INSTAGRAM_CACHE_DIR?.trim();
  if (configured) {
    if (!isAbsolute(configured)) throw new Error("Instagram cache requires an absolute path");
    return configured;
  }
  // Reuse the existing Amplitude PVC mount without requiring another volume.
  const amplitudeRoot = process.env.AMPLITUDE_CACHE_DIR?.trim();
  if (process.env.NODE_ENV === "production") return join(amplitudeRoot && isAbsolute(amplitudeRoot) ? amplitudeRoot : "/app/.data/amplitude", "instagram");
  // Runtime data must stay outside the source tree: Turbopack traces dynamic fs reads.
  return "/tmp/neki-admin-instagram";
}

const hash = (key: string) => createHash("sha256").update(key).digest("hex");

export async function readInstagramSnapshot(key: string) {
  try {
    const keyHash = hash(key);
    const path = join(cacheRoot(), "snapshots", `${keyHash}.json`);
    const info = await stat(/* turbopackIgnore: true */ path);
    if (!info.isFile() || info.size > MAX_BYTES) return null;
    const stored = object(JSON.parse(await readFile(/* turbopackIgnore: true */ path, "utf8")));
    if (stored.schemaVersion !== 1 || stored.keyHash !== keyHash || !instant(stored.storedAt) ||
      typeof stored.expiresAt !== "number" || stored.expiresAt <= Date.now() || stored.expiresAt > Date.now() + TTL_MS ||
      !isSnapshot(stored.value) || Date.parse(stored.value.fetchedAt) + TTL_MS <= Date.now()) return null;
    return { value: stored.value, storedAt: stored.storedAt };
  } catch { return null; }
}

export async function writeInstagramSnapshot(key: string, value: InstagramMetricsSnapshot, token: string): Promise<string | null> {
  let temporary: string | undefined;
  try {
    if (!isSnapshot(value)) return null;
    const serialized = JSON.stringify(value);
    if (serialized.includes(token) || serialized.length > MAX_BYTES) return null;
    const directory = join(cacheRoot(), "snapshots");
    const keyHash = hash(key);
    const path = join(directory, `${keyHash}.json`);
    temporary = `${path}.${randomUUID()}.tmp`;
    const storedAt = new Date().toISOString();
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(/* turbopackIgnore: true */ temporary, JSON.stringify({ schemaVersion: 1, keyHash, storedAt,
      expiresAt: Date.parse(value.fetchedAt) + TTL_MS, value }), { encoding: "utf8", mode: 0o600 });
    await rename(/* turbopackIgnore: true */ temporary, path);
    return storedAt;
  } catch {
    if (temporary) await unlink(temporary).catch(() => undefined);
    return null;
  }
}
