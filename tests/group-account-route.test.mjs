import assert from "node:assert/strict";
import test from "node:test";

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("group-account-test", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

const requestRoute = (url) => worker.fetch(
  new Request(url),
  {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  },
  { waitUntil() {}, passThroughOnException() {} },
);

const originalMode = process.env.GROUP_ACCOUNT_DATA_MODE;
const originalToken = process.env.OPENBANKING_ACCESS_TOKEN;
const originalFintechNumber = process.env.OPENBANKING_FINTECH_USE_NUM;

test.after(() => {
  if (originalMode === undefined) delete process.env.GROUP_ACCOUNT_DATA_MODE;
  else process.env.GROUP_ACCOUNT_DATA_MODE = originalMode;
  if (originalToken === undefined) delete process.env.OPENBANKING_ACCESS_TOKEN;
  else process.env.OPENBANKING_ACCESS_TOKEN = originalToken;
  if (originalFintechNumber === undefined) delete process.env.OPENBANKING_FINTECH_USE_NUM;
  else process.env.OPENBANKING_FINTECH_USE_NUM = originalFintechNumber;
});

test("returns unconfigured status without credentials", async () => {
  delete process.env.GROUP_ACCOUNT_DATA_MODE;
  delete process.env.OPENBANKING_ACCESS_TOKEN;
  delete process.env.OPENBANKING_FINTECH_USE_NUM;

  const response = await requestRoute("http://localhost/api/group-account/status");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    state: "unconfigured",
    message: "계좌 연결 정보가 없습니다.",
  });
});

test("returns mock transactions only when mock mode is explicit", async () => {
  process.env.GROUP_ACCOUNT_DATA_MODE = "mock";
  delete process.env.OPENBANKING_ACCESS_TOKEN;
  delete process.env.OPENBANKING_FINTECH_USE_NUM;

  const response = await requestRoute("http://localhost/api/group-account/transactions?from=2026-08-01&to=2026-08-31&direction=all&page=1");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.pageSize, 25);
  assert.ok(Array.isArray(body.items));
  assert.match(body.items[0].occurredAt, /^2026-/);
  assert.doesNotMatch(JSON.stringify(body), /access_token|fintech_use_num|account_number/i);
});
