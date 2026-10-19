import "server-only";
import { getAuth } from "./auth";
import { accessError, getAdminAccess } from "./admin-access";
import { allowedEmails, authSettings, isAdminAuthEnabled, loginPath, safeReturnTo } from "./auth-policy";

const json = (code: string, status: number) => Response.json({ code }, { status, headers: { "Cache-Control": "no-store" } });

export async function handleAuth(request: Request): Promise<Response> {
  if (!isAdminAuthEnabled()) return json("authentication_disabled", 404);
  const path = new URL(request.url).pathname;
  if (path === "/api/auth/get-session" && request.method === "GET") {
    const access = await getAdminAccess(request.headers);
    return access.ok ? Response.json({ user: access.user }, { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } }) : accessError(access);
  }
  const callback = path === "/api/auth/callback/google" && request.method === "GET";
  const signIn = path === "/api/auth/sign-in/social" && request.method === "POST";
  const signOut = path === "/api/auth/sign-out" && request.method === "POST";
  // Do not expose account linking, token retrieval, user updates or other library endpoints.
  if (!callback && !signIn && !signOut) return json("not_found", 404);
  const settings = authSettings();
  const auth = getAuth();
  if (!auth || !settings || (!signOut && !allowedEmails().size)) return json("auth_not_configured", 503);
  if (!callback && request.headers.get("origin") !== settings.baseURL) return json("invalid_origin", 403);
  if (signIn) {
    let body: Record<string, unknown>;
    try { body = await request.json(); } catch { return json("invalid_request", 400); }
    if (!body || body.provider !== "google" || "idToken" in body) return json("invalid_request", 400);
    const returnTo = safeReturnTo(body.callbackURL);
    request = new Request(request, { body: JSON.stringify({ provider: "google", callbackURL: returnTo, errorCallbackURL: loginPath(returnTo), disableRedirect: true }) });
  }
  const response = await auth.handler(request);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
