import "server-only";
import { betterAuth } from "better-auth";
import { allowedEmails, authSettings, COOKIE_PREFIX, isAllowedIdentity, SESSION_SECONDS, SESSION_VERSION } from "./auth-policy";

function createAuth(settings: NonNullable<ReturnType<typeof authSettings>>) {
  return betterAuth({
    appName: "Neki Admin",
    baseURL: settings.baseURL,
    secret: settings.secret,
    trustedOrigins: [settings.baseURL],
    logger: { disabled: true },
    telemetry: { enabled: false },
    onAPIError: { errorURL: "/login" },
    socialProviders: {
      google: {
        clientId: settings.clientId,
        clientSecret: settings.clientSecret,
        // Google's built-in provider already requests only openid/email/profile.
        accessType: "online",
        prompt: "select_account",
      },
    },
    user: {
      validateUserInfo: ({ user, source }) => {
        if (source.oauth?.providerId !== "google" || !isAllowedIdentity(user, allowedEmails())) {
          return { error: "admin_access_denied", errorDescription: "접근 권한이 없습니다." };
        }
      },
    },
    session: {
      expiresIn: SESSION_SECONDS,
      disableSessionRefresh: true,
      cookieCache: { enabled: true, strategy: "jwe", maxAge: SESSION_SECONDS, refreshCache: false, version: SESSION_VERSION },
    },
    account: { storeStateStrategy: "cookie", storeAccountCookie: false, accountLinking: { enabled: false } },
    advanced: {
      cookiePrefix: COOKIE_PREFIX,
      useSecureCookies: settings.secure,
      defaultCookieAttributes: { httpOnly: true, secure: settings.secure, sameSite: "lax", path: "/" },
    },
  });
}

let current: { key: string; auth: ReturnType<typeof createAuth> } | undefined;

export function getAuth() {
  const settings = authSettings();
  if (!settings) return null;
  const key = JSON.stringify(settings);
  if (!current || current.key !== key) current = { key, auth: createAuth(settings) };
  return current.auth;
}
