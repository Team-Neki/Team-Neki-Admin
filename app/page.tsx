import AdminApp from "./admin/AdminApp";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAdminAccess } from "./server/auth/admin-access";
import { loginPath } from "./server/auth/auth-policy";

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await getAdminAccess(await headers());
  if (!access.ok) {
    const params = new URLSearchParams();
    Object.entries(await searchParams).forEach(([key, value]) => {
      for (const item of Array.isArray(value) ? value : value ? [value] : []) params.append(key, item);
    });
    redirect(loginPath(`/?${params}`, access.status === 403 ? "admin_access_denied" : access.status === 503 ? "configuration" : undefined));
  }
  return <AdminApp user={access.user} />;
}
