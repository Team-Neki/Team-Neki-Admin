import { createHash } from "node:crypto";
import { brandSources, collectionPages } from "./sources.mjs";

const clean = (value) => typeof value === "string" ? value.normalize("NFC").replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g, " ").trim() : "";
const patterns = {
  collaboration: /콜라보|collab|\s+[X×]\s+/i,
  frame: /프레임|frame/i,
  event: /이벤트|event|팝업|pop[- ]?up/i,
  partnership: /제휴/,
};

export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

export function koreaDay(timestamp) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid reference timestamp");
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url : null;
  } catch { return null; }
}

function canonicalUrl(value, page, externalId) {
  const url = safeUrl(value);
  if (!url) return null;
  if (page.parser === "instagram-public") {
    if (url.origin !== "https://www.instagram.com" || ![ `/${page.account}/p/${externalId}/`, `/${page.account}/reel/${externalId}/` ].includes(url.pathname)) return null;
    url.search = "";
    url.hash = "";
    return url.href;
  }
  if (page.parser === "imweb-gallery") {
    if (url.origin !== new URL(page.url).origin || url.pathname !== new URL(page.url).pathname || url.hash !== `#caption_${externalId}`) return null;
    url.search = "";
    return url.href;
  }
  if (page.parser === "naver-rss") {
    if (url.hostname !== "blog.naver.com" || url.port || url.pathname !== `/${page.account}/${externalId}`) return null;
    url.search = "";
  } else {
    if (url.origin !== new URL(page.url).origin) return null;
    if (page.parser === "photosignature") {
      if (url.pathname !== "/bbs/board.php" || url.searchParams.get("bo_table") !== "frame" || url.searchParams.get("wr_id") !== externalId) return null;
    } else {
      const expectedPath = new URL(page.url).pathname.replace(/\/$/, "");
      if (url.pathname.replace(/\/$/, "") !== expectedPath || url.searchParams.get("bmode") !== "view" || url.searchParams.get("idx") !== externalId) return null;
    }
    for (const key of [...url.searchParams.keys()]) if (!["bo_table", "wr_id", "bmode", "idx"].includes(key)) url.searchParams.delete(key);
    url.searchParams.sort();
  }
  url.hash = "";
  return url.href;
}

function classify(item, page) {
  const title = clean(item.title);
  const excerpt = clean(item.excerpt);
  const tags = Object.entries(patterns).filter(([, pattern]) => pattern.test(title)).map(([tag]) => tag);
  const sourceCategory = ["photosignature", "imweb-gallery"].includes(page.parser) ? "frame"
    : page.parser === "photomatic" && ["frame", "event"].includes(item.kind) ? item.kind : null;
  if (sourceCategory && !tags.includes(sourceCategory)) tags.push(sourceCategory);
  const bodyHints = Object.entries(patterns).filter(([, pattern]) => pattern.test(excerpt)).map(([tag]) => tag);
  const primary = ["collaboration", "frame", "event", "partnership"].find((tag) => tags.includes(tag)) ?? "news";
  return { primary, tags, bodyHints, basis: sourceCategory ? "source-category-and-title" : "title-keywords", evidenceText: title };
}

function normalizeOne(item, asOfDay, pages, brands) {
  const page = pages.find((source) => source.key === item.sourceKey);
  const brand = brands.find((source) => source.brandId === item.brandId);
  const externalId = clean(item.externalId);
  const title = clean(item.title);
  const reasons = [];
  if (!page || !brand || page.brandId !== item.brandId) reasons.push("unregistered-source-or-brand");
  if (!(page?.parser === "instagram-public" ? /^[A-Za-z0-9_-]{5,20}$/ : /^\d+$/).test(externalId)) reasons.push("invalid-external-id");
  if (item.id !== `${item.brandId}:${item.sourceKey}:${externalId}`) reasons.push("inconsistent-record-id");
  if (!title) reasons.push("missing-title");
  if (!/^[a-f0-9]{64}$/.test(item.fingerprint ?? "")) reasons.push("invalid-source-fingerprint");
  const url = page && canonicalUrl(item.sourceUrl, page, externalId);
  if (!url) reasons.push("untrusted-or-inconsistent-source-url");
  if (reasons.length) return { rejected: { id: clean(item.id) || null, sourceKey: clean(item.sourceKey) || null, title: title || null, reasons } };

  const warnings = [];
  const optionalDate = (value, field) => {
    const normalized = validDate(value);
    if (value && !normalized) warnings.push(`invalid-${field}`);
    return normalized;
  };
  const publishedOn = optionalDate(item.publishedOn, "publication-date");
  let startsOn = optionalDate(item.startsOn, "start-date");
  let endsOn = optionalDate(item.endsOn, "end-date");
  if (startsOn && endsOn && startsOn > endsOn) {
    warnings.push("reversed-period");
    startsOn = endsOn = null;
  }
  const classification = classify(item, page);
  const relevance = classification.tags.some((tag) => ["frame", "collaboration", "event"].includes(tag)) ? "frame-event"
    : classification.primary === "partnership" ? "partnership"
    : classification.bodyHints.length ? "possible-related-news" : "general-news";
  if (!publishedOn) warnings.push("publication-date-missing");
  if (publishedOn && publishedOn > asOfDay) warnings.push("future-publication-date");
  if (relevance === "frame-event") {
    if (!startsOn) warnings.push("start-date-unverified");
    if (!endsOn) warnings.push("end-date-unverified");
  }
  if (relevance === "possible-related-news") warnings.push("body-keyword-only");
  if (Array.isArray(item.needsReview) && item.needsReview.includes("image-only-details")) warnings.push("image-only-details");
  if (item.needsReview?.includes("generated-title")) warnings.push("generated-title");
  if (page.parser === "instagram-public") warnings.push("caption-derived-title", "social-image-url-may-expire");
  const image = item.imageUrl ? safeUrl(item.imageUrl) : null;
  const imageUrls = [...new Set([image?.href, ...(Array.isArray(item.imageUrls) ? item.imageUrls.map((value) => safeUrl(value)?.href) : [])].filter(Boolean))].slice(0, 20);
  if (item.imageUrl && !image) warnings.push("unsafe-image-url");
  if (!image) warnings.push("image-url-missing");
  const observedAt = Number.isFinite(Date.parse(item.observedAt ?? "")) ? new Date(item.observedAt).toISOString() : null;
  if (!observedAt) warnings.push("observation-time-missing");
  // Never infer a city/booth scope from a title alone.
  const normalized = {
    id: item.id,
    brand: { id: brand.brandId, name: brand.brand },
    title, classification, relevance,
    publishedOn,
    period: { startsOn, endsOn, rawText: clean(item.rawDateText) || null,
      yearBasis: startsOn || endsOn ? /\d{4}\./.test(item.rawDateText ?? "") ? "explicit-source-year" : item.rawDateText && publishedOn ? "publication-year" : "unknown" : "unknown" },
    scope: { type: "unverified" },
    media: { imageUrl: image?.href ?? null, imageUrls },
    content: { excerpt: clean(item.excerpt) || null },
    source: { key: page.key, externalId, url, fingerprint: item.fingerprint, observedAt },
    status: { review: item.reviewStatus === "approved" || item.reviewStatus === "rejected" ? item.reviewStatus : "pending",
      reportedEnded: item.sourceStatus === "ended", availability: "unverified",
      calendarHint: endsOn && endsOn < asOfDay ? "past-listed-period" : startsOn && startsOn > asOfDay ? "future-listed-period" : startsOn && endsOn ? "within-listed-period" : "unknown" },
    quality: { warnings: [...new Set(warnings)].sort() },
  };
  const contentFingerprint = createHash("sha256").update(JSON.stringify({ ...normalized, source: { ...normalized.source, observedAt: null }, status: { ...normalized.status, review: null } })).digest("hex");
  return { normalized, contentFingerprint };
}

export function normalizeRecords(records, { generatedAt = new Date().toISOString(), pages = collectionPages, brands = brandSources } = {}) {
  if (!Array.isArray(records)) throw new Error("Records must be an array");
  const asOfDay = koreaDay(generatedAt);
  const rejected = [];
  const groups = new Map();
  for (const input of records) {
    if (!input || typeof input !== "object" || Array.isArray(input)) { rejected.push({ id: null, reasons: ["invalid-record-shape"] }); continue; }
    const result = normalizeOne(input, asOfDay, pages, brands);
    if (result.rejected) rejected.push(result.rejected);
    else groups.set(result.normalized.id, [...(groups.get(result.normalized.id) ?? []), result]);
  }
  let duplicatesCollapsed = 0;
  const normalized = [];
  for (const [id, group] of groups) {
    if (new Set(group.map((item) => item.contentFingerprint)).size > 1) {
      rejected.push(...group.map((item) => ({ id, sourceKey: item.normalized.source.key, title: item.normalized.title, reasons: ["conflicting-duplicate"] })));
      continue;
    }
    duplicatesCollapsed += group.length - 1;
    normalized.push(group.sort((a, b) => (b.normalized.source.observedAt ?? "").localeCompare(a.normalized.source.observedAt ?? ""))[0].normalized);
  }
  normalized.sort((a, b) => (b.publishedOn ?? "").localeCompare(a.publishedOn ?? "") || a.id.localeCompare(b.id));
  return { schemaVersion: 1, generatedAt: new Date(generatedAt).toISOString(), asOfDay, grain: "one-official-source-post", inputCount: records.length, duplicatesCollapsed, records: normalized, rejected };
}
