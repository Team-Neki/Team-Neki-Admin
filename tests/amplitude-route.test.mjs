import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { startTestServer } from "./server-test-helper.mjs";

let providerServer;
let unconfiguredServer;
let configuredServer;
let cacheDirectory;
let configuredEnvironment;
const providerRequests = [];

const startProviderServer = () => new Promise((resolve, reject) => {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://provider.test");
    providerRequests.push({
      path: url.pathname,
      metric: url.searchParams.get("m"),
      interval: url.searchParams.get("i"),
      authorization: request.headers.authorization,
    });
    response.setHeader("content-type", "application/json");
    if (url.pathname === "/api/2/events/segmentation") {
      const metric = url.searchParams.get("m");
      response.end(JSON.stringify({
        data: {
          seriesLabels: [[0, "app_open"], [0, "map_view"]],
          seriesCollapsed: [[{ value: metric === "totals" ? 42 : 7 }], [{ value: metric === "totals" ? 21 : 5 }]],
          series: metric === "totals" ? [[20, 22], [10, 11]] : [[4, 3], [3, 2]],
          xValues: ["2026-09-01", "2026-09-02"],
        },
      }));
      return;
    }
    if (url.pathname === "/api/2/users") {
      const grouped = url.searchParams.get("g") === "platform";
      const metric = url.searchParams.get("m");
      const interval = url.searchParams.get("i");
      if (!grouped) {
        response.end(JSON.stringify({ data: { xValues: ["2026-09-01", "2026-09-02"], series: [[12, 18]] } }));
        return;
      }
      const values = metric === "new"
        ? [[10], [20]]
        : interval === "1" ? [[100], [80]]
          : interval === "7" ? [[400], [350]]
            : [[1000], [900]];
      response.end(JSON.stringify({
        data: {
          xValues: ["2026-09-14"],
          seriesLabels: ["Android", "iOS"],
          series: values,
        },
      }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "not_found" }));
  });
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => resolve(server));
});

test.before(async () => {
  providerServer = await startProviderServer();
  const address = providerServer.address();
  const providerBaseUrl = `http://127.0.0.1:${address.port}`;
  cacheDirectory = await mkdtemp(join(tmpdir(), "neki-amplitude-cache-"));
  configuredEnvironment = {
    AMPLITUDE_API_KEY: "test-api-key",
    AMPLITUDE_SECRET_KEY: "test-secret-key",
    AMPLITUDE_API_BASE_URL: providerBaseUrl,
    AMPLITUDE_REGION: "us",
    AMPLITUDE_TIME_ZONE: "Asia/Seoul",
    AMPLITUDE_PROJECT_START_DATE: "2024-01-01",
    AMPLITUDE_CACHE_DIR: cacheDirectory,
  };
  [unconfiguredServer, configuredServer] = await Promise.all([
    startTestServer({ AMPLITUDE_API_KEY: "", AMPLITUDE_SECRET_KEY: "" }),
    startTestServer(configuredEnvironment),
  ]);
});

test.after(async () => {
  await Promise.all([unconfiguredServer?.stop(), configuredServer?.stop()]);
  await new Promise((resolve) => providerServer?.close(resolve));
  if (cacheDirectory) await rm(cacheDirectory, { recursive: true, force: true });
});

test("returns a clear error when Amplitude server credentials are missing", async () => {
  const response = await fetch(`${unconfiguredServer.baseUrl}/api/amplitude/metrics`);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    code: "amplitude_not_configured",
    message: "Amplitude API 키를 설정한 뒤 다시 시도해 주세요.",
  });
});

test("loads all event totals and uniques with three Amplitude requests", async () => {
  const requestStart = providerRequests.length;
  const response = await fetch(
    `${configuredServer.baseUrl}/api/amplitude/metrics?granularity=day&startDate=2026-09-01&endDate=2026-09-02&refresh=1`,
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  const requests = providerRequests.slice(requestStart);
  assert.equal(requests.length, 3);
  assert.equal(requests.filter((request) => request.path === "/api/2/events/segmentation").length, 2);
  assert.equal(requests.filter((request) => request.path === "/api/2/users").length, 1);
  assert.ok(requests.every((request) => request.authorization?.startsWith("Basic ")));
  assert.deepEqual(payload.events.find((event) => event.name === "app_open"), { name: "app_open", total: 42, uniques: 7 });
  assert.deepEqual(payload.activeUsers, [{ date: "2026-09-01", value: 12 }, { date: "2026-09-02", value: 18 }]);

  const projectCacheKey = createHash("sha256").update("test-api-key").digest("hex").slice(0, 16);
  const dailyPath = join(cacheDirectory, "daily", projectCacheKey, "2026-09-01.json");
  const daily = JSON.parse(await readFile(dailyPath, "utf8"));
  assert.equal(daily.finalized, true);
  assert.equal(daily.projectCacheKey, projectCacheKey);
  assert.deepEqual(daily.events.find((event) => event.name === "app_open"), {
    name: "app_open",
    total: 20,
    uniques: 4,
  });
  assert.equal((await stat(dailyPath)).mode & 0o777, 0o600);
  assert.doesNotMatch(JSON.stringify(daily), /test-api-key|test-secret-key/);

  await configuredServer.stop();
  configuredServer = await startTestServer(configuredEnvironment);
  const persistedRequestStart = providerRequests.length;
  const persistedResponse = await fetch(
    `${configuredServer.baseUrl}/api/amplitude/metrics?granularity=day&startDate=2026-09-01&endDate=2026-09-02&refresh=1`,
  );
  assert.equal(persistedResponse.status, 200);
  assert.deepEqual(await persistedResponse.json(), payload);
  assert.equal(providerRequests.length - persistedRequestStart, 0);

  const dailyRequestStart = providerRequests.length;
  const dailyResponse = await fetch(
    `${configuredServer.baseUrl}/api/amplitude/metrics?granularity=day&startDate=2026-09-01&endDate=2026-09-01`,
  );
  assert.equal(dailyResponse.status, 200);
  const dailyPayload = await dailyResponse.json();
  assert.deepEqual(dailyPayload.events.find((event) => event.name === "app_open"), {
    name: "app_open",
    total: 20,
    uniques: 4,
  });
  assert.equal(providerRequests.length - dailyRequestStart, 0);
});

test("loads DAU, WAU, MAU and cumulative users with four Amplitude requests", async () => {
  const requestStart = providerRequests.length;
  const response = await fetch(
    `${configuredServer.baseUrl}/api/amplitude/dashboard?granularity=day&anchorDate=2026-09-14`,
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  const requests = providerRequests.slice(requestStart);
  assert.equal(requests.length, 4);
  assert.equal(payload.activeUsers.dau.value, 180);
  assert.equal(payload.activeUsers.wau.value, 750);
  assert.equal(payload.activeUsers.mau.value, 1900);
  assert.equal(payload.totalUsers, 30);
  assert.equal(payload.androidUsers, 10);
  assert.equal(payload.iosUsers, 20);
});
