import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { proxyAdminApiGet } from "../app/api/admin-api/admin-api-proxy.ts";

const ENDPOINT_ENV = "NEKI_ADMIN_TEST_API_URL";

test.afterEach(() => {
  delete process.env[ENDPOINT_ENV];
});

test("returns a clear state until the backend endpoint is configured", async () => {
  const response = await proxyAdminApiGet(new Request("http://localhost/api/test"), {
    endpointEnvironmentVariable: ENDPOINT_ENV,
    queryParameters: [],
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    code: "admin_api_not_configured",
    message: "관리자 API가 연결되지 않았습니다.",
  });
});

test("forwards only the declared query parameters to the configured endpoint", async () => {
  let requestedUrl = "";
  const server = createServer((request, response) => {
    requestedUrl = request.url ?? "";
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ ok: true }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  process.env[ENDPOINT_ENV] = `http://127.0.0.1:${address.port}/metrics?fixed=1`;

  try {
    const response = await proxyAdminApiGet(new Request("http://localhost/api/test?startDate=2026-09-01&ignored=value"), {
      endpointEnvironmentVariable: ENDPOINT_ENV,
      queryParameters: ["startDate"],
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(requestedUrl, "/metrics?fixed=1&startDate=2026-09-01");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
