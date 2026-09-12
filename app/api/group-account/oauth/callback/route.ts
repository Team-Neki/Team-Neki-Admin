import { timingSafeEqual } from "node:crypto";

import { type NextRequest, NextResponse } from "next/server";

import {
  saveOpenBankingCredential,
  setOpenBankingAuthorizationError,
} from "../../open-banking-credential-store";
import {
  exchangeOpenBankingAuthorizationCode,
  OpenBankingOAuthError,
} from "../../open-banking-oauth-server";

export const dynamic = "force-dynamic";

const OAUTH_STATE_COOKIE = "neki_openbanking_oauth_state";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const response = params.get("code") && hasValidState(
    params.get("state"),
    request.cookies.get(OAUTH_STATE_COOKIE)?.value ?? null,
  )
    ? await finishAuthorization(request, params.get("code") as string)
    : failAuthorization(request, callbackErrorMessage(params));

  response.cookies.delete({ name: OAUTH_STATE_COOKIE, path: "/api/group-account/oauth/callback" });
  response.headers.set("cache-control", "no-store");
  return response;
}

const finishAuthorization = async (request: NextRequest, code: string) => {
  try {
    const credential = await exchangeOpenBankingAuthorizationCode(code);
    saveOpenBankingCredential(credential);
    const connection = credential.selectedFintechUseNumber ? "connected" : "select-account";
    return NextResponse.redirect(new URL(`/?view=group-account&connection=${connection}`, request.url));
  } catch (error) {
    const message = error instanceof OpenBankingOAuthError
      ? error.message
      : "오픈뱅킹 인증을 완료하지 못했습니다.";
    setOpenBankingAuthorizationError(message);
    return NextResponse.redirect(new URL("/?view=group-account&connection=error", request.url));
  }
};

const failAuthorization = (request: NextRequest, message: string) => {
  setOpenBankingAuthorizationError(message);
  return NextResponse.redirect(new URL("/?view=group-account&connection=error", request.url));
};

const callbackErrorMessage = (params: URLSearchParams) => {
  if (params.get("error")) return "오픈뱅킹 인증이 취소되었거나 거부되었습니다.";
  if (!params.get("code")) return "오픈뱅킹 인증 코드가 없습니다.";
  return "오픈뱅킹 인증 요청을 확인할 수 없습니다.";
};

const hasValidState = (actual: string | null, expected: string | null) => {
  if (!actual || !expected) return false;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
};
