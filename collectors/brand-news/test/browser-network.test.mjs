import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { fetchPublicInstagramHtml } from "../src/instagram-browser.mjs";
import { selectedPages } from "../src/collection-scope.mjs";

test("real Chrome observes internal 429 on a 200 profile without contacting Instagram", { skip: process.env.BRAND_NEWS_TEST_BROWSER !== "1" }, async () => {
  const source = selectedPages.find((page) => page.account === "life4cuts_official");
  const paths = [];
  const browser = await chromium.launch({ executablePath: process.env.BRAND_NEWS_CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const launchBrowser = async () => ({
    close: () => browser.close(),
    async newContext(options) {
      const context = await browser.newContext(options);
      return { route: (...args) => context.route(...args), async newPage() {
        const page = await context.newPage();
        // Page routes take precedence over the collector's context routes. Every
        // request is fulfilled locally; no credentials or external traffic.
        await page.route("**/*", (route) => {
          const path = new URL(route.request().url()).pathname;
          paths.push(path);
          if (path === "/api/fixture") return route.fulfill({ status: 429, headers: { "retry-after": "3600" }, contentType: "application/json", body: "{}" });
          return route.fulfill({ status: 200, contentType: "text/html", body: `<a href="/${source.account}/p/FIRST123/">Post</a><script>fetch('/api/fixture')</script>` });
        });
        return page;
      } };
    },
  });
  await assert.rejects(fetchPublicInstagramHtml(source, { launchBrowser, snapshotDirectory: null, maxDurationMs: 5000 }), (error) => error.code === "rate-limited" && error.retryAfterMs === 3_600_000);
  assert.ok(paths.includes("/api/fixture"));
  assert.equal(paths.some((path) => path.includes("/p/")), false);
  assert.equal(browser.isConnected(), false);
});
