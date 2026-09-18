import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { startTestServer } from "./server-test-helper.mjs";

let unconfiguredServer;
let mockServer;
let oauthServer;
let providerServer;
let tokenRequestBody = "";
const bankTransactionIds = [];

const startProviderServer = () => new Promise((resolve, reject) => {
  const server = createServer(async (request, response) => {
    if (request.url === "/oauth/2.0/token" && request.method === "POST") {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      tokenRequestBody = Buffer.concat(chunks).toString("utf8");
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        access_token: "server-only-access-token",
        refresh_token: "server-only-refresh-token",
        expires_in: 3600,
        user_seq_no: "1100000001",
        scope: "login inquiry",
      }));
      return;
    }
    if (request.url === "/v2.0/user/me?user_seq_no=1100000001") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        rsp_code: "A0000",
        res_list: [{
          fintech_use_num: "199000000000000000000001",
          bank_name: "토스뱅크",
          account_alias: "네키 모임통장",
          account_num_masked: "1000***1234",
          inquiry_agree_yn: "Y",
        }],
      }));
      return;
    }
    if (request.url?.startsWith("/v2.0/account/transaction_list/fin_num?")) {
      const transactionUrl = new URL(request.url, "http://provider.test");
      bankTransactionIds.push(transactionUrl.searchParams.get("bank_tran_id"));
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ rsp_code: "A0000", next_page_yn: "N", res_list: [] }));
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => resolve(server));
});

test.before(async () => {
  providerServer = await startProviderServer();
  const providerAddress = providerServer.address();
  const providerBaseUrl = `http://127.0.0.1:${providerAddress.port}`;
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
  oauthServer = await startTestServer({
    GROUP_ACCOUNT_DATA_MODE: "",
    OPENBANKING_BASE_URL: providerBaseUrl,
    OPENBANKING_CLIENT_ID: "test-client-id",
    OPENBANKING_CLIENT_SECRET: "test-client-secret",
    OPENBANKING_REDIRECT_URI: "https://admin.neki.test/api/group-account/oauth/callback",
    OPENBANKING_CLIENT_USE_CODE: "M202609120",
    OPENBANKING_ACCESS_TOKEN: "",
    OPENBANKING_FINTECH_USE_NUM: "",
  });
});

test.after(async () => {
  await Promise.all([unconfiguredServer?.stop(), mockServer?.stop(), oauthServer?.stop()]);
  await new Promise((resolve) => providerServer?.close(resolve));
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

test("completes OAuth on the server without exposing the client secret", async () => {
  const connectResponse = await fetch(`${oauthServer.baseUrl}/api/group-account/connect`, { redirect: "manual" });
  assert.equal(connectResponse.status, 307);
  const authorizationUrl = new URL(connectResponse.headers.get("location"));
  assert.equal(authorizationUrl.pathname, "/oauth/2.0/authorize");
  assert.equal(authorizationUrl.searchParams.get("client_id"), "test-client-id");
  assert.equal(authorizationUrl.searchParams.get("redirect_uri"), "https://admin.neki.test/api/group-account/oauth/callback");
  assert.equal(authorizationUrl.searchParams.has("client_secret"), false);

  const state = authorizationUrl.searchParams.get("state");
  assert.match(state, /^[a-f0-9]{32}$/);
  const stateCookie = connectResponse.headers.get("set-cookie").split(";", 1)[0];
  const callbackResponse = await fetch(
    `${oauthServer.baseUrl}/api/group-account/oauth/callback?code=test-code&state=${state}`,
    { headers: { cookie: stateCookie }, redirect: "manual" },
  );
  assert.equal(callbackResponse.status, 307);
  assert.match(callbackResponse.headers.get("location"), /view=group-account&connection=connected/);
  assert.match(tokenRequestBody, /client_secret=test-client-secret/);

  const statusResponse = await fetch(`${oauthServer.baseUrl}/api/group-account/status`);
  assert.equal(statusResponse.status, 200);
  assert.deepEqual(await statusResponse.json(), {
    state: "connected",
    accountLabel: "토스뱅크 · 네키 모임통장 · 1000***1234",
    lastSyncedAt: null,
  });

  const transactionQueries = ["all", "in"].map((direction) =>
    fetch(`${oauthServer.baseUrl}/api/group-account/transactions?from=2026-09-01&to=2026-09-12&direction=${direction}&page=1`));
  const transactionResponses = await Promise.all(transactionQueries);
  assert.deepEqual(transactionResponses.map((response) => response.status), [200, 200]);
  assert.equal(bankTransactionIds.length, 2);
  assert.match(bankTransactionIds[0], /^M202609120U[A-F0-9]{9}$/);
  assert.notEqual(bankTransactionIds[0], bankTransactionIds[1]);
});
