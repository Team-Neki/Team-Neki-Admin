import { NextRequest, NextResponse } from "next/server";
import { accessError, getAdminAccess } from "./app/server/auth/admin-access";
import { loginPath } from "./app/server/auth/auth-policy";

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === "/login" || pathname.startsWith("/api/auth/")) {
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  if (pathname.startsWith("/_next/") || pathname.startsWith("/poses/") || ["/icon.png", "/apple-icon.png", "/og.png", "/favicon.ico"].includes(pathname)) return NextResponse.next();
  const access = await getAdminAccess(request.headers);
  if (!access.ok) {
    if (pathname.startsWith("/api/")) return accessError(access);
    return NextResponse.redirect(new URL(loginPath(`${pathname}${search}`, access.status === 403 ? "admin_access_denied" : access.status === 503 ? "configuration" : undefined), request.url));
  }
  const response = NextResponse.next();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
