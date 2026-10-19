import "server-only";
import { getCookieCache } from "better-auth/cookies";
import type { AdminUser } from "../../admin/types";
import { getAuth } from "./auth";
import { allowedEmails, authSettings, COOKIE_PREFIX, isAdminAuthEnabled, isAllowedIdentity, SESSION_VERSION } from "./auth-policy";

type AdminAccess = { ok: true; user: AdminUser | null } | { ok: false; status: 401 | 403 | 503; code: string; message: string };

export async function getAdminAccess(headers: Headers): Promise<AdminAccess> {
  if (!isAdminAuthEnabled()) return { ok: true, user: null };
  const auth = getAuth();
  const emails = allowedEmails();
  if (!auth || !emails.size) return { ok: false, status: 503, code: "auth_not_configured", message: "로그인 설정을 확인해 주세요." };
  try {
    const settings = authSettings()!;
    const cached = await getCookieCache(headers, { cookiePrefix: COOKIE_PREFIX, isSecure: settings.secure, strategy: "jwe", secret: settings.secret, version: SESSION_VERSION });
    if (!cached) return { ok: false, status: 401, code: "authentication_required", message: "로그인이 필요합니다." };
    const session = await auth.api.getSession({ headers });
    if (!session) return { ok: false, status: 401, code: "authentication_required", message: "로그인이 필요합니다." };
    if (!isAllowedIdentity(session.user, emails)) return { ok: false, status: 403, code: "access_denied", message: "접근 권한이 없습니다." };
    return { ok: true, user: { email: session.user.email, name: session.user.name || session.user.email, expiresAt: new Date(session.session.expiresAt).toISOString() } };
  } catch {
    return { ok: false, status: 503, code: "auth_unavailable", message: "로그인 상태를 확인하지 못했습니다. 다시 시도해 주세요." };
  }
}

export function accessError(access: Extract<AdminAccess, { ok: false }>): Response {
  return Response.json({ code: access.code, message: access.message }, { status: access.status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
}

export async function requireAdminApi(request: Request): Promise<Response | null> {
  const access = await getAdminAccess(request.headers);
  return access.ok ? null : accessError(access);
}
