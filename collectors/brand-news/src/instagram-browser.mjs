import { chromium } from "playwright-core";
import { setTimeout as delay } from "node:timers/promises";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseInstagramMetadata } from "./instagram-metadata.mjs";
import { checkInstagramNavigation, InstagramAccessError } from "./instagram-access.mjs";
import { watchInstagramNetwork } from "./instagram-network.mjs";
import { recordPostFailure, selectPosts } from "./post-policy.mjs";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Anonymous public pages only. No saved session, login, private endpoint or bypass.
export async function fetchPublicInstagramHtml(source, { limit = 12, snapshotDirectory = "data/public-snapshots", maxDurationMs = 120_000, now = Date.now, wait = delay, launchBrowser, knownRecords = [], failedPosts = [], observedAt = new Date().toISOString() } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 12 || !Number.isFinite(maxDurationMs) || maxDurationMs < 1_000) throw new Error("Invalid Instagram collection budget");
  const deadline = now() + maxDurationMs;
  const remaining = (maximum) => {
    const budget = deadline - now();
    if (budget <= 0) throw new InstagramAccessError("Instagram source time budget exhausted", "deadline-exceeded");
    return Math.min(maximum, budget);
  };
  const browser = await (launchBrowser ?? (() => chromium.launch({ executablePath: process.env.BRAND_NEWS_CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true })))();
  let guard;
  let failures = [...failedPosts];
  let sourceDiscovered = false;
  try {
    const context = await browser.newContext({ locale: "en-US" });
    // Read metadata; do not download photographs, video or fonts.
    await context.route("**/*", (route) => guard?.blocked || ["image", "media", "font"].includes(route.request().resourceType()) ? route.abort() : route.continue());
    const tab = await context.newPage();
    guard = watchInstagramNetwork(tab, now);
    const navigate = async (url) => {
      const response = await guard.run(() => tab.goto(url, { waitUntil: "domcontentloaded", timeout: remaining(30_000) }));
      checkInstagramNavigation(response?.status() ?? 0, tab.url(), (await response?.allHeaders())?.["retry-after"], now());
    };
    await navigate(source.url);
    try {
      await guard.run(() => tab.waitForSelector(`a[href*='/${source.account}/p/'],a[href*='/${source.account}/reel/']`, { timeout: remaining(15_000) }));
    } catch (error) {
      if (error instanceof InstagramAccessError) throw error;
      checkInstagramNavigation(200, tab.url());
      throw new InstagramAccessError("Instagram public post list unavailable or layout changed", "layout-changed");
    }
    const posts = await guard.run(() => tab.locator("a[href*='/p/'],a[href*='/reel/']").evaluateAll((links, account) => [...new Set(links.map((a) => a.href))].filter((href) => {
      const u = new URL(href);
      return u.hostname === "www.instagram.com" && u.pathname.startsWith(`/${account}/`) && new RegExp(`^/[^/]+/(?:p|reel)/[A-Za-z0-9_-]+/$`).test(u.pathname);
    }), source.account));
    sourceDiscovered = true;
    const selected = selectPosts(posts, { knownRecords, failedPosts, observedAt, limit }).filter((href) => {
      const url = new URL(href);
      return url.origin === "https://www.instagram.com" && url.pathname.startsWith(`/${source.account}/`) && /^\/[^/]+\/(?:p|reel)\/[A-Za-z0-9_-]+\/$/.test(url.pathname) && !url.search && !url.hash;
    });
    const articles = [];
    let failedDetails = 0;
    let attemptedDetails = 0;
    let consecutiveDetailFailures = 0;
    let lastFailure = null;
    for (const href of selected) {
      let attempted = false;
      let stage = "navigate";
      try {
        await guard.run(() => wait(remaining(2000)));
        remaining(1);
        attemptedDetails += 1;
        attempted = true;
        await navigate(href);
        stage = "metadata";
        await guard.run(() => tab.waitForSelector("meta[property='og:description']", { state: "attached", timeout: remaining(10_000) }));
        const item = await guard.run(() => tab.evaluate(() => ({
          url: document.querySelector("meta[property='og:url']")?.content,
          description: document.querySelector("meta[property='og:description']")?.content,
          image: document.querySelector("meta[property='og:image']")?.content,
        })));
        stage = "parse";
        if (!parseInstagramMetadata(item.description, source.account) || item.url !== href) throw new InstagramAccessError("Instagram post metadata or author did not match", "layout-changed");
        articles.push(`<article data-post-url="${escape(item.url)}" data-description="${escape(item.description)}" data-image="${escape(item.image)}"></article>`);
        failures = failures.filter((failure) => failure.url !== href);
        consecutiveDetailFailures = 0;
      } catch (error) {
        lastFailure = error instanceof InstagramAccessError ? error : new InstagramAccessError("Instagram detail unavailable or layout changed", "layout-changed");
        if (attempted) {
          failedDetails += 1;
          failures = failures.filter((failure) => failure.url !== href).concat(recordPostFailure(href, stage, lastFailure, failedPosts.find((failure) => failure.url === href), observedAt));
        }
        consecutiveDetailFailures += 1;
        if (lastFailure.stopSource || consecutiveDetailFailures >= 3) break;
      }
    }
    if (!articles.length && selected.length) throw lastFailure ?? new InstagramAccessError("Instagram public posts unavailable", "layout-changed");
    const html = `<main data-source-account="${escape(source.account)}" data-listed="${posts.length}" data-selected="${selected.length}" data-attempted="${attemptedDetails}" data-read="${articles.length}" data-failed="${failedDetails}" data-post-failures="${escape(JSON.stringify(failures))}" data-failure-code="${escape(lastFailure?.code ?? "")}" data-retry-after-ms="${lastFailure?.retryAfterMs ?? 0}">${articles.join("")}</main>`;
    if (snapshotDirectory && source.key && /^[a-z0-9-]+$/.test(source.key)) {
      await mkdir(snapshotDirectory, { recursive: true });
      await writeFile(join(snapshotDirectory, `${source.key}.html`), html);
    }
    return html;
  } catch (error) {
    error.failedPosts = failures;
    error.sourceDiscovered = sourceDiscovered;
    throw error;
  } finally { guard?.dispose(); await browser.close(); }
}
