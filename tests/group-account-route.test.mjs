import assert from "node:assert/strict";
import test from "node:test";
import { startTestServer } from "./server-test-helper.mjs";

let unconfiguredServer;
let mockServer;

test.before(async () => {
  [unconfiguredServer, mockServer] = await Promise.all([
    startTestServer({
      GROUP_ACCOUNT_DATA_MODE: "",
      OPENBANKING_ACCESS_TOKEN: "",
      OPENBANKING_FINTECH_USE_NUM: "",
    }),
    startTestServer({
      GROUP_ACCOUNT_DATA_MODE: "mock",
      OPENBANKING_ACCESS_TOKEN: "",
      OPENBANKING_FINTECH_USE_NUM: "",
    }),
  ]);
});

test.after(async () => {
  await Promise.all([unconfiguredServer?.stop(), mockServer?.stop()]);
});

test("returns unconfigured status without credentials", async () => {
  const response = await fetch(`${unconfiguredServer.baseUrl}/api/group-account/status`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    state: "unconfigured",
    message: "계좌 연결 정보가 없습니다.",
  });
});

test("returns mock transactions only when mock mode is explicit", async () => {
  const response = await fetch(`${mockServer.baseUrl}/api/group-account/transactions?from=2026-08-01&to=2026-08-31&direction=all&page=1`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.pageSize, 25);
  assert.ok(Array.isArray(body.items));
  assert.match(body.items[0].occurredAt, /^2026-/);
  assert.doesNotMatch(JSON.stringify(body), /access_token|fintech_use_num|account_number/i);
});
