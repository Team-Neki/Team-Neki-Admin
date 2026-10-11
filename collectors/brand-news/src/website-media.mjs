import { load } from "cheerio";
import { setTimeout as delay } from "node:timers/promises";
import { recordPostFailure } from "./post-policy.mjs";
import { contentFingerprint } from "./content-fingerprint.mjs";

export function websiteImages(html, source) {
  const $ = load(html);
  const selector = source.parser === "photosignature" ? ".view_image img" : source.parser === "harufilm-news" ? ".board_txt_area img" : null;
  if (!selector) return [];
  return [...new Set($(selector).toArray().map((element) => {
    try {
      const url = new URL($(element).attr("data-original") || $(element).attr("src"), source.url);
      const allowed = source.parser === "photosignature" ? url.origin === new URL(source.url).origin : url.hostname === "cdn.imweb.me";
      return allowed && url.protocol === "https:" && !url.username && !url.password ? url.href : null;
    } catch { return null; }
  }).filter(Boolean))].slice(0, 20);
}

export async function enrichWebsiteImages(records, source, { previous, observedAt, readHtml, wait = delay, limit = 12 }) {
  const known = new Map((previous?.records ?? []).map((record) => [record.id, record]));
  let failedPosts = [...(previous?.diagnostics?.find((item) => item.sourceKey === source.key)?.failedPosts ?? [])];
  let attempted = 0;
  let failureCode;
  let retryAfterMs;
  const result = [];
  for (const record of records) {
    const earlier = known.get(record.id);
    const failure = failedPosts.find((item) => item.url === record.sourceUrl);
    const due = !earlier?.mediaObservedAt || Date.parse(observedAt) - Date.parse(earlier.mediaObservedAt) >= 24 * 3_600_000;
    let enriched = earlier?.imageUrls?.length ? { ...record, imageUrl: earlier.imageUrl, imageUrls: earlier.imageUrls, mediaObservedAt: earlier.mediaObservedAt } : record;
    if (due && attempted < limit && !failureCode && failure?.status !== "needs-review" && !(Date.parse(failure?.nextAttemptAt ?? "") > Date.parse(observedAt))) {
      attempted += 1;
      await wait(2000);
      try {
        const images = websiteImages(await readHtml(record.sourceUrl), source);
        if (!images.length) throw Object.assign(new Error("Detail images unavailable"), { code: "layout-changed" });
        enriched = { ...record, imageUrl: images[0], imageUrls: images, mediaObservedAt: observedAt };
        failedPosts = failedPosts.filter((item) => item.url !== record.sourceUrl);
      } catch (error) {
        if (["rate-limited", "access-denied"].includes(error.code)) { failureCode = error.code; retryAfterMs = error.retryAfterMs; }
        else failedPosts = failedPosts.filter((item) => item.url !== record.sourceUrl).concat(recordPostFailure(record.sourceUrl, "media", error, failure, observedAt));
      }
    }
    result.push({ ...enriched, fingerprint: contentFingerprint(enriched) });
  }
  return { records: result, failedPosts, failureCode, retryAfterMs, attemptedDetails: attempted };
}
