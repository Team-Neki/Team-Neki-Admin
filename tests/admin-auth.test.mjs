import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { allowedEmails, authSettings, isAdminAuthEnabled, isAllowedIdentity, safeReturnTo } from "../app/server/auth/auth-policy.ts";
import { sessionCookie, TEST_ADMIN_EMAIL } from "./auth-test-helper.mjs";
import { startTestServer } from "./server-test-helper.mjs";

let server;
test.before(async () => { server = await startTestServer(); });
test.after(async () => server?.stop());
const apiPaths = ["/api/amplitude/dashboard", "/api/amplitude/metrics?refresh=1", "/api/amplitude/metrics/export?format=csv", "/api/amplitude/metrics/export?format=json", "/api/brand-news"];
const request = (path, cookie, init = {}) => fetch(`${server.baseUrl}${path}`, { redirect: "manual", ...init, headers: { ...(cookie ? { cookie } : {}), ...init.headers } });

test("Google login is opt-in; disabled mode renders anonymously and disables OAuth endpoints", async () => {
  for (const value of ["", "false", "0", "TRUE", "invalid"]) assert.equal(isAdminAuthEnabled(value), false);
  assert.equal(isAdminAuthEnabled("true"), true);
  const open = await startTestServer({ ADMIN_AUTH_ENABLED: "", GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "", BETTER_AUTH_SECRET: "", ADMIN_ALLOWED_EMAILS: "", AMPLITUDE_API_KEY: "", AMPLITUDE_SECRET_KEY: "", INSTAGRAM_ACCESS_TOKEN: "" });
  try {
    const response = await fetch(`${open.baseUrl}/?view=instagram`, { redirect: "manual" });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /Neki/);
    assert.doesNotMatch(html, /Google로 로그인|로그아웃|테스트 운영자|admin@neki.example/);
    const login = await fetch(`${open.baseUrl}/login?returnTo=%2F%3Fview%3Dinstagram`, { redirect: "manual" });
    assert.equal(login.status, 307);
    assert.equal(new URL(login.headers.get("location"), open.baseUrl).search, "?view=instagram");
    for (const path of ["/api/instagram/metrics", "/api/amplitude/metrics"]) {
      const result = await fetch(`${open.baseUrl}${path}`);
      assert.equal(result.status, 503); // Provider configuration, not an authentication block.
      assert.doesNotMatch(await result.text(), /authentication_required|auth_not_configured/);
    }
    const session = await fetch(`${open.baseUrl}/api/auth/get-session`);
    assert.equal(session.status, 404);
    assert.equal((await session.json()).code, "authentication_disabled");
    assert.equal((await fetch(`${open.baseUrl}/api/auth/sign-in/social`, { method: "POST" })).status, 404);
  } finally { await open.stop(); }
});

test("only exact verified emails are allowed, never wildcard/domain aliases", () => {
  const emails = allowedEmails(" Admin@Neki.Example,other@neki.example, *@neki.example, @neki.example ");
  assert.deepEqual([...emails], [TEST_ADMIN_EMAIL, "other@neki.example"]);
  assert.equal(isAllowedIdentity({ email: " ADMIN@NEKI.EXAMPLE ", emailVerified: true }, emails), true);
  for (const email of ["admin+alias@neki.example", "someone@neki.example", "admin@neki.example.attacker.com"]) assert.equal(isAllowedIdentity({ email, emailVerified: true }, emails), false);
  for (const verified of [false, undefined, "true"]) assert.equal(isAllowedIdentity({ email: TEST_ADMIN_EMAIL, emailVerified: verified }, emails), false);
  assert.equal(isAllowedIdentity({ email: TEST_ADMIN_EMAIL, emailVerified: true }, new Set()), false);
});

test("return destinations preserve admin filters and reject open redirects/auth loops", () => {
  assert.equal(safeReturnTo("/?view=brand-news&newsCategory=frame#posts"), "/?view=brand-news&newsCategory=frame#posts");
  for (const value of ["https://evil.example/", "//evil.example/", "/\\evil.example/", "/login", "/api/auth/callback/google", "/%2f%2fevil.example", ["/"], "/\n"]) assert.equal(safeReturnTo(value), "/");
});

test("anonymous pages redirect before rendering the admin shell and preserve filters", async () => {
  const response = await request("/?view=brand-news&newsCategory=frame");
  assert.equal(response.status, 307);
  const target = new URL(response.headers.get("location"), server.baseUrl);
  assert.equal(target.pathname, "/login");
  assert.equal(target.searchParams.get("returnTo"), "/?view=brand-news&newsCategory=frame");
  assert.doesNotMatch(await response.text(), /운영 데이터를 불러오고|Amplitude 지표/);
  const login = await request("/login");
  assert.equal(login.status, 200);
  assert.match(await login.text(), /Google로 로그인/);
});

test("every data/export API rejects anonymous and spoofed-header requests", async () => {
  for (const path of apiPaths) {
    const response = await request(path, undefined, { headers: { "x-middleware-subrequest": "proxy:proxy:proxy:proxy:proxy", "oai-authenticated-user-email": TEST_ADMIN_EMAIL, "x-forwarded-user": TEST_ADMIN_EMAIL } });
    assert.equal(response.status, 401, path);
    assert.equal((await response.json()).code, "authentication_required");
    assert.match(response.headers.get("cache-control"), /no-store/);
  }
});

test("valid sessions return only display identity, not session or provider tokens", async () => {
  const response = await request("/api/auth/get-session", server.cookie);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(Object.keys(body), ["user"]);
  assert.deepEqual(Object.keys(body.user).sort(), ["email", "expiresAt", "name"]);
  assert.equal(body.user.email, TEST_ADMIN_EMAIL);
  const html = await (await request("/?view=brands", server.cookie)).text();
  assert.match(html, /테스트 운영자/);
  assert.match(html, /admin@neki.example/);
  assert.doesNotMatch(html, /Super Admin|네키 운영자/);
  const login = await request("/login?returnTo=%2F%3Fview%3Dbrands", server.cookie);
  assert.equal(login.status, 307);
  assert.equal(new URL(login.headers.get("location"), server.baseUrl).search, "?view=brands");
});

test("unverified, removed and disallowed identities cannot use a validly signed session", async () => {
  for (const identity of [{ email: "outsider@neki.example" }, { emailVerified: false }]) {
    const cookie = await sessionCookie(identity);
    for (const path of apiPaths) assert.equal((await request(path, cookie)).status, 403, path);
  }
  const removed = await startTestServer({ ADMIN_ALLOWED_EMAILS: "replacement@neki.example" });
  try {
    const response = await fetch(`${removed.baseUrl}/api/auth/get-session`, { headers: { cookie: server.cookie } });
    assert.equal(response.status, 403);
    const html = await (await fetch(`${removed.baseUrl}/login`, { headers: { cookie: server.cookie } })).text();
    assert.match(html, /접근 권한이 없습니다/);
  } finally { await removed.stop(); }
});

test("expired, tampered, incomplete and mismatched cookies fail closed", async () => {
  const expired = await sessionCookie({ expiresIn: -30 });
  const parts = server.cookie.split("; ");
  const otherParts = (await sessionCookie()).split("; ");
  for (const cookie of [expired, `${parts[0]}; ${parts[1]}tampered`, parts[0], parts[1], `${parts[0]}; ${otherParts[1]}`, "neki-admin.session_token=fake; neki-admin.session_data=fake"]) {
    assert.equal((await request("/api/auth/get-session", cookie)).status, 401);
  }
});

test("missing OAuth configuration and empty allowlist block pages and data", async () => {
  for (const environment of [{ ADMIN_ALLOWED_EMAILS: "" }, { BETTER_AUTH_SECRET: "" }, { GOOGLE_CLIENT_ID: "" }, { BETTER_AUTH_URL: "http://untrusted.example" }]) {
    const isolated = await startTestServer(environment);
    try {
      const response = await fetch(`${isolated.baseUrl}/api/amplitude/metrics`, { headers: { cookie: server.cookie } });
      assert.equal(response.status, 503);
      const html = await (await fetch(`${isolated.baseUrl}/login`)).text();
      assert.match(html, /로그인 설정을 확인/);
      assert.match(html, /disabled=""/);
    } finally { await isolated.stop(); }
  }
  assert.equal(authSettings(), null);
});

test("OAuth starts with state and PKCE, fixed callback, minimum scopes and no external return URL", async () => {
  const response = await request("/api/auth/sign-in/social", undefined, {
    method: "POST", headers: { origin: server.baseUrl, "content-type": "application/json", "x-forwarded-host": "evil.example", "x-forwarded-proto": "https" },
    body: JSON.stringify({ provider: "google", callbackURL: "https://evil.example", scopes: ["drive"], errorCallbackURL: "https://evil.example" }),
  });
  assert.equal(response.status, 200);
  const url = new URL((await response.json()).url);
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("redirect_uri"), `${server.baseUrl}/api/auth/callback/google`);
  assert.ok(url.searchParams.get("state"));
  assert.ok(url.searchParams.get("code_challenge"));
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.deepEqual(url.searchParams.get("scope").split(" ").sort(), ["email", "openid", "profile"]);
  assert.equal(url.searchParams.get("access_type"), "online");
  assert.match(response.headers.get("set-cookie"), /HttpOnly/i);
  assert.match(response.headers.get("set-cookie"), /SameSite=Lax/i);
  const stateCookies = response.headers.getSetCookie().map((cookie) => cookie.split(";")[0]).join("; ");
  const cancelled = await request(`/api/auth/callback/google?error=access_denied&state=${encodeURIComponent(url.searchParams.get("state"))}`, stateCookies);
  const destination = new URL(cancelled.headers.get("location"), server.baseUrl);
  assert.equal(destination.pathname, "/login");
  assert.equal(destination.searchParams.get("returnTo"), "/");
  assert.equal(destination.searchParams.get("error"), "access_denied");
  const invalidCallback = await request("/api/auth/callback/google?code=fake&state=forged");
  assert.equal(invalidCallback.status, 302);
  assert.equal(new URL(invalidCallback.headers.get("location"), server.baseUrl).pathname, "/login");
  assert.doesNotMatch(invalidCallback.headers.get("set-cookie") ?? "", /session_data=[^;]/);
});

test("production OAuth uses the canonical HTTPS origin and Secure host-only cookies", async () => {
  const isolated = await startTestServer({ BETTER_AUTH_URL: "https://admin-web.suitestudy.com:4641" });
  try {
    const response = await fetch(`${isolated.baseUrl}/api/auth/sign-in/social`, {
      method: "POST", headers: { origin: "https://admin-web.suitestudy.com:4641", "content-type": "application/json" },
      body: JSON.stringify({ provider: "google", callbackURL: "/?view=brands" }),
    });
    assert.equal(response.status, 200);
    assert.equal(new URL((await response.json()).url).searchParams.get("redirect_uri"), "https://admin-web.suitestudy.com:4641/api/auth/callback/google");
    const cookies = response.headers.getSetCookie();
    assert.ok(cookies.length > 0);
    for (const cookie of cookies) {
      assert.match(cookie, /^__Secure-neki-admin\./);
      assert.match(cookie, /; Secure(?:;|$)/i);
      assert.match(cookie, /HttpOnly/i);
      assert.match(cookie, /SameSite=Lax/i);
      assert.doesNotMatch(cookie, /Domain=/i);
    }
  } finally { await isolated.stop(); }
});

test("CSRF and unused auth/token/account endpoints are rejected", async () => {
  for (const origin of [undefined, "https://evil.example"]) {
    const response = await request("/api/auth/sign-out", server.cookie, { method: "POST", headers: { "content-type": "application/json", ...(origin ? { origin } : {}) }, body: "{}" });
    assert.equal(response.status, 403);
  }
  for (const path of ["/api/auth/get-access-token", "/api/auth/link-social", "/api/auth/update-user", "/api/auth/sign-up/email", "/api/auth/sign-in/email"]) assert.equal((await request(path, server.cookie, { method: "POST", headers: { origin: server.baseUrl } })).status, 404);
  const directToken = await request("/api/auth/sign-in/social", undefined, { method: "POST", headers: { origin: server.baseUrl, "content-type": "application/json" }, body: JSON.stringify({ provider: "google", idToken: { token: "fake" } }) });
  assert.equal(directToken.status, 400);
});

test("logout clears both auth cookies and subsequent anonymous requests are rejected", async () => {
  const response = await request("/api/auth/sign-out", server.cookie, { method: "POST", headers: { origin: server.baseUrl, "content-type": "application/json" }, body: "{}" });
  assert.equal(response.status, 200);
  const cookies = response.headers.getSetCookie();
  for (const name of ["session_token", "session_data"]) assert.ok(cookies.some((cookie) => cookie.includes(`neki-admin.${name}=`) && /max-age=0/i.test(cookie)));
  assert.equal((await request("/api/auth/get-session")).status, 401);
});

test("each data handler owns its guard even if Proxy is skipped", async () => {
  for (const route of ["amplitude/dashboard", "amplitude/metrics", "amplitude/metrics/export", "brand-news"]) {
    const source = await readFile(new URL(`../app/api/${route}/route.ts`, import.meta.url), "utf8");
    assert.match(source, /await requireAdminApi\(request\)/);
    const handler = source.slice(source.indexOf("export async function GET"));
    assert.ok(handler.indexOf("await requireAdminApi(request)") < handler.indexOf("  try {"));
  }
});
