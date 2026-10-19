export const SESSION_SECONDS = 8 * 60 * 60;
export const SESSION_VERSION = "neki-admin-v1";
export const COOKIE_PREFIX = "neki-admin";

// Google login is temporarily opt-in in both local and deployed environments.
export function isAdminAuthEnabled(value = process.env.ADMIN_AUTH_ENABLED): boolean {
  return value === "true";
}

export function allowedEmails(value = process.env.ADMIN_ALLOWED_EMAILS ?? ""): Set<string> {
  return new Set(value.split(",").map((email) => email.trim().toLowerCase()).filter((email) => /^[^\s@*,]+@[^\s@*,]+\.[^\s@*,]+$/.test(email)));
}

export function isAllowedIdentity(user: { email?: unknown; emailVerified?: unknown }, emails = allowedEmails()): boolean {
  return user.emailVerified === true && typeof user.email === "string" && emails.has(user.email.trim().toLowerCase());
}

export function authSettings() {
  const baseURL = process.env.BETTER_AUTH_URL?.trim();
  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!baseURL || !secret || secret.length < 32 || !clientId || !clientSecret) return null;
  try {
    const url = new URL(baseURL);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash || (url.protocol !== "https:" && !(local && url.protocol === "http:"))) return null;
    return { baseURL: url.origin, secret, clientId, clientSecret, secure: url.protocol === "https:" };
  } catch { return null; }
}

// Only the existing admin entrypoint is a valid post-login destination.
export function safeReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) return "/";
  try {
    const url = new URL(value, "https://admin.invalid");
    return url.origin === "https://admin.invalid" && url.pathname === "/" ? `${url.pathname}${url.search}${url.hash}` : "/";
  } catch { return "/"; }
}

export function loginPath(returnTo: unknown, error?: string): string {
  const params = new URLSearchParams({ returnTo: safeReturnTo(returnTo) });
  if (error) params.set("error", error);
  return `/login?${params}`;
}
