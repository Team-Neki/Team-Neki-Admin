import { type NextRequest, NextResponse } from "next/server";

import { setOpenBankingAuthorizationError } from "../open-banking-credential-store";
import {
  createOpenBankingAuthorizationUrl,
  createOpenBankingOAuthState,
  OpenBankingOAuthError,
} from "../open-banking-oauth-server";

export const dynamic = "force-dynamic";

const OAUTH_STATE_COOKIE = "neki_openbanking_oauth_state";

export async function GET(request: NextRequest) {
  const state = createOpenBankingOAuthState();
  let authorizationUrl: URL;
  try {
    authorizationUrl = createOpenBankingAuthorizationUrl(state);
  } catch (error) {
    setOpenBankingAuthorizationError(
      error instanceof OpenBankingOAuthError ? error.message : "오픈뱅킹 인증을 시작하지 못했습니다.",
    );
    return NextResponse.redirect(new URL("/?view=group-account&connection=error", request.url));
  }

  const response = NextResponse.redirect(authorizationUrl);
  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 10 * 60,
    path: "/api/group-account/oauth/callback",
  });
  response.headers.set("cache-control", "no-store");
  return response;
}
