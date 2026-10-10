import * as cheerio from "cheerio";
import { parseInstagramMetadata } from "./instagram-metadata.mjs";
import { contentFingerprint } from "./content-fingerprint.mjs";

const clean = (value) => String(value ?? "").normalize("NFC").replace(/[\u200B-\u200D\uFEFF\u2800]/g, " ").replace(/\s+/g, " ").trim();

function imageUrl(href, pageUrl) {
  if (!href) return null;
  try {
    const url = new URL(href, pageUrl);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function sourceUrl(href, pageUrl) {
  const url = new URL(href, pageUrl);
  if (url.protocol !== "https:" || url.origin !== new URL(pageUrl).origin) return null;
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (!(["bo_table", "wr_id", "bmode", "idx"].includes(key))) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return url.href;
}

function rangeFromText(text, year) {
  const match = clean(text).match(/(?:^|\s)(?:(\d{4})\.)?(\d{1,2})\.(\d{1,2})\s*[~〜-]\s*(?:(?:(\d{4})\.)?(\d{1,2})\.(\d{1,2}))?/);
  if (!match) return { startsOn: null, endsOn: null };
  const startYear = match[1] ? Number(match[1]) : year;
  const endYear = match[4] ? Number(match[4]) : startYear;
  const date = (dateYear, month, day) => {
    if (!dateYear || dateYear < 2000 || dateYear > 2100) return null;
    const result = new Date(Date.UTC(dateYear, Number(month) - 1, Number(day)));
    if (result.getUTCFullYear() !== dateYear || result.getUTCMonth() + 1 !== Number(month) || result.getUTCDate() !== Number(day)) return null;
    return result.toISOString().slice(0, 10);
  };
  const startsOn = date(startYear, match[2], match[3]);
  const endsOn = match[5] ? date(endYear, match[5], match[6]) : null;
  // A season crossing years needs explicit year evidence, not a guess.
  if (endsOn && startsOn && endsOn < startsOn) return { startsOn: null, endsOn: null };
  return { startsOn, endsOn };
}

function candidate(page, externalId, title, url, details = {}) {
  const normalizedTitle = clean(title);
  if (!externalId || !normalizedTitle || !url) return null;
  const rawDateText = clean(details.rawDateText);
  const publishedOn = details.publishedOn ?? null;
  const year = publishedOn ? Number(publishedOn.slice(0, 4)) : null;
  const { startsOn, endsOn } = rangeFromText(rawDateText, year);
  const normalizedImageUrl = imageUrl(details.imageUrl, page.url);
  const imageUrls = Array.isArray(details.imageUrls) ? [...new Set(details.imageUrls.map((value) => imageUrl(value, page.url)).filter(Boolean))].slice(0, 20) : undefined;
  const excerpt = clean(details.excerpt).slice(0, 2000) || null;
  const sourceStatus = /종료[!！.\s]*$/.test(normalizedTitle) ? "ended" : "unknown";
  const needsReview = [];
  if (!startsOn) needsReview.push("start-date-unverified");
  if (!endsOn) needsReview.push("end-date-unverified");
  if (details.imageOnly) needsReview.push("image-only-details");
  const id = `${page.brandId}:${page.key}:${externalId}`;
  const fingerprint = contentFingerprint({ title: normalizedTitle, rawDateText, publishedOn, imageUrl: normalizedImageUrl, imageUrls, excerpt });
  return {
    id, externalId, brandId: page.brandId, brand: page.brand, sourceKey: page.key, sourceUrl: url,
    title: normalizedTitle, kind: details.kind ?? page.kind,
    publishedOn, startsOn, endsOn, rawDateText: rawDateText || null,
    imageUrl: normalizedImageUrl, ...(imageUrls ? { imageUrls } : {}), excerpt, sourceStatus, availability: "unverified", needsReview, fingerprint, fingerprintVersion: 2,
  };
}

export function parsePhotoSignature(html, page) {
  const $ = cheerio.load(html);
  return $("#bo_gall .listBox > li").toArray().map((element) => {
    const row = $(element);
    const href = row.find("a[href*='wr_id=']").first().attr("href");
    const url = href && sourceUrl(href, page.url);
    if (!url) return null;
    const externalId = new URL(url).searchParams.get("wr_id");
    const publishedOn = row.html()?.match(/<!--\s*<div class="bo_info">\s*<span>(\d{4}-\d{2}-\d{2})<\/span>/)?.[1] ?? null;
    return candidate(page, externalId, row.find(".txtBox h3").first().text(), url, {
      publishedOn,
      rawDateText: row.find(".txtBox .bo_info span").first().text(),
      imageUrl: row.find(".imgBox img").first().attr("src") ?? null,
    });
  }).filter(Boolean);
}

export function parseHaruFilm(html, page) {
  const $ = cheerio.load(html);
  const seen = new Set();
  return $("a[href*='bmode=view'][href*='idx=']").toArray().map((element) => {
    const href = $(element).attr("href");
    const url = href && sourceUrl(href, page.url);
    if (!url) return null;
    const externalId = new URL(url).searchParams.get("idx");
    if (seen.has(externalId)) return null;
    seen.add(externalId);
    const thumbnailStyle = $(element).find(".card_wrapper").first().attr("style") ?? "";
    const thumbnailUrl = thumbnailStyle.match(/background-image:\s*url\(["']?([^"')]+)/i)?.[1] ?? null;
    return candidate(page, externalId, clean($(element).text()).replace(/^공지\s*/, ""), url, {
      imageOnly: true,
      imageUrl: thumbnailUrl,
    });
  }).filter(Boolean);
}

export function parsePhotomatic(html, page) {
  const $ = cheerio.load(html);
  return $(".acd_row").toArray().map((element) => {
    const row = $(element);
    const category = clean(row.find(".acd_heading .category").first().text());
    if (!["BOOTH", "EVENT"].includes(category)) return null;
    const title = clean(row.find(".acd_heading .title").first().text());
    if (!title || (category === "BOOTH" && !/프레임|frame/i.test(title))) return null;
    const externalId = row.find(".acd_heading[id^='collapse_header_']").first().attr("id")?.replace("collapse_header_", "");
    if (!externalId) return null;
    const url = sourceUrl(`/NOTICE/?bmode=view&idx=${externalId}`, page.url);
    const body = row.find(".board_contents").first();
    return candidate(page, externalId, title, url, {
      kind: category === "BOOTH" ? "frame" : "event",
      rawDateText: body.text().match(/(?:\d{4}\.)?\d{1,2}\.\d{1,2}\s*[~〜-]\s*(?:\d{4}\.)?\d{1,2}\.\d{1,2}/)?.[0] ?? "",
      imageUrl: body.find("img").first().attr("src") ?? null,
      excerpt: body.text(),
    });
  }).filter(Boolean);
}

// Classification is a review hint, never proof of current booth availability.
function kindFromTitle(title) {
  if (/콜라보|collab/i.test(title)) return "collaboration";
  if (/프레임|frame/i.test(title)) return "frame";
  if (/제휴/.test(title)) return "partnership";
  if (/이벤트|event/i.test(title)) return "event";
  return "news";
}

function calendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

export function parseHaruNews(html, page) {
  const $ = cheerio.load(html);
  const seen = new Set();
  return $(".card[onclick*='bmode=view']").toArray().map((element) => {
    const row = $(element);
    // Read the literal URL only; never execute source JavaScript.
    const href = row.attr("onclick")?.match(/location\.href\s*=\s*['"]([^'"]+)['"]/)?.[1];
    const url = href && sourceUrl(href, page.url);
    const externalId = url && new URL(url).searchParams.get("idx");
    if (!externalId || seen.has(externalId)) return null;
    seen.add(externalId);
    const titleNode = row.find(".title").first().clone();
    titleNode.find("em, .icons").remove();
    const title = clean(titleNode.text());
    return candidate(page, externalId, title, url, {
      kind: kindFromTitle(title),
      publishedOn: calendarDate(clean(row.find(".date").first().text())),
      imageUrl: row.find("img[data-original]").first().attr("data-original"),
      excerpt: row.find(".text-block").first().text(),
      imageOnly: true,
    });
  }).filter(Boolean);
}

export function parseNaverRss(xml, page) {
  const $ = cheerio.load(xml, { xmlMode: true });
  const seen = new Set();
  return $("rss > channel > item").toArray().map((element) => {
    const row = $(element);
    let url;
    try { url = new URL(clean(row.find("link").first().text())); }
    catch { return null; }
    // Only the verified official blog account may supply records.
    const match = url.pathname.match(/^\/([^/]+)\/(\d+)\/?$/);
    if (url.protocol !== "https:" || url.hostname !== "blog.naver.com" || !match || match[1] !== page.account) return null;
    const externalId = match[2];
    if (seen.has(externalId)) return null;
    seen.add(externalId);
    url.search = "";
    url.hash = "";
    const description = cheerio.load(row.find("description").first().text());
    description("script, style").remove();
    const date = new Date(clean(row.find("pubDate").first().text()));
    const publishedOn = Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(date)
      : null;
    const title = clean(row.find("title").first().text());
    return candidate(page, externalId, title, url.href, {
      kind: kindFromTitle(title),
      publishedOn,
      excerpt: description.text(),
      imageUrl: description("img").first().attr("src"),
    });
  }).filter(Boolean);
}

export function parsePage(html, page) {
  if (page.parser === "imweb-gallery") return parseImwebGallery(html, page);
  if (page.parser === "instagram-public") return parseInstagramSnapshot(html, page);
  if (page.parser === "photosignature") return parsePhotoSignature(html, page);
  if (page.parser === "harufilm") return parseHaruFilm(html, page);
  if (page.parser === "photomatic") return parsePhotomatic(html, page);
  if (page.parser === "harufilm-news") return parseHaruNews(html, page);
  if (page.parser === "naver-rss") return parseNaverRss(html, page);
  throw new Error(`Unknown parser: ${page.parser}`);
}

export function parseImwebGallery(html, page) {
  const $ = cheerio.load(html);
  const seen = new Set();
  return $(".text_wrap[id^='gal_item_']").toArray().map((element) => {
    const row = $(element);
    const id = row.attr("id")?.match(/^gal_item_(\d+)$/)?.[1];
    if (!id || seen.has(id)) return null;
    seen.add(id);
    const title = clean(row.find(".title").text());
    const item = candidate(page, id, title || `제목 미표기 · 갤러리 ${id}`, `${page.url}#caption_${id}`, {
      imageUrl: row.attr("data-src"), imageOnly: true,
    });
    if (!title && item) item.needsReview.push("generated-title");
    return item;
  }).filter(Boolean);
}

export function parseInstagramSnapshot(html, page) {
  const $ = cheerio.load(html);
  if ($("main").attr("data-source-account") !== page.account) return [];
  return $("article[data-post-url]").toArray().map((element) => {
    const row = $(element);
    const url = row.attr("data-post-url");
    const match = url?.match(/^https:\/\/www\.instagram\.com\/([^/]+)\/(p|reel)\/([A-Za-z0-9_-]+)\/$/);
    if (!match || match[1] !== page.account) return null;
    const description = row.attr("data-description") ?? "";
    const metadata = parseInstagramMetadata(description, page.account);
    if (!metadata) return null;
    const { publishedOn, caption } = metadata;
    const paragraphs = caption.split(/\n\s*\n/).map((paragraph) => paragraph.split("\n").map(clean).filter((line) => line && !/^#[\p{L}\p{N}_]+$/u.test(line)).join(" ")).filter(Boolean);
    const first = paragraphs[0];
    const title = (caption.trim().startsWith("#EVENT") ? `#EVENT · ${first?.replace(/^#EVENT\s*/, "")}` : first)?.slice(0, 180);
    return candidate(page, match[3], title, url, {
      kind: kindFromTitle(caption), publishedOn, excerpt: caption,
      imageUrl: row.attr("data-image"), imageUrls: JSON.parse(row.attr("data-images") ?? "[]"), imageOnly: false,
    });
  }).filter(Boolean);
}
