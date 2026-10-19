import { randomBytes, randomUUID } from "node:crypto";
import { makeSignature, symmetricEncodeJWT } from "better-auth/crypto";
import { COOKIE_PREFIX, SESSION_SECONDS, SESSION_VERSION } from "../app/server/auth/auth-policy.ts";

export const TEST_AUTH_SECRET = randomBytes(48).toString("base64url");
export const TEST_ADMIN_EMAIL = "admin@neki.example";

// Real library-compatible cookies signed only with test credentials. No application bypass exists.
export async function sessionCookie({ secret = TEST_AUTH_SECRET, email = TEST_ADMIN_EMAIL, emailVerified = true, expiresIn = SESSION_SECONDS, secure = false, token = randomUUID() } = {}) {
  const now = new Date();
  const data = {
    session: { id: randomUUID(), token, userId: "test-admin", expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(), createdAt: now.toISOString(), updatedAt: now.toISOString() },
    user: { id: "test-admin", name: "테스트 운영자", email, emailVerified, createdAt: now.toISOString(), updatedAt: now.toISOString(), image: null },
    updatedAt: Date.now(), version: SESSION_VERSION,
  };
  const encrypted = await symmetricEncodeJWT(data, secret, "better-auth-session", Math.max(expiresIn, 1));
  const signature = await makeSignature(token, secret);
  const prefix = `${secure ? "__Secure-" : ""}${COOKIE_PREFIX}`;
  return `${prefix}.session_token=${encodeURIComponent(`${token}.${signature}`)}; ${prefix}.session_data=${encrypted}`;
}
