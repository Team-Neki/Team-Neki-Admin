import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LoginScreen } from "../admin/features/auth";
import { getAdminAccess } from "../server/auth/admin-access";
import { allowedEmails, authSettings, safeReturnTo } from "../server/auth/auth-policy";

export const metadata: Metadata = { title: "로그인 — Neki Admin" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const returnTo = safeReturnTo(params.returnTo);
  const access = await getAdminAccess(await headers());
  if (access.ok) redirect(returnTo);
  return <LoginScreen configured={Boolean(authSettings() && allowedEmails().size)} returnTo={returnTo} error={access.status === 403 ? "admin_access_denied" : typeof params.error === "string" ? params.error : undefined} />;
}
