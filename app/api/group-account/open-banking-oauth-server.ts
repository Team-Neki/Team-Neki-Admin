import "server-only";

import { randomBytes } from "node:crypto";

import type { OpenBankingAccount, OpenBankingCredential } from "./open-banking-credential-store";

const AUTHORIZE_PATH = "/oauth/2.0/authorize";
const TOKEN_PATH = "/oauth/2.0/token";
const USER_INFO_PATH = "/v2.0/user/me";
const OAUTH_STATE_LENGTH = 32;

type OpenBankingOAuthConfig = {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string;
  authType: string;
};

type TokenResponse = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  user_seq_no?: unknown;
  scope?: unknown;
  rsp_code?: unknown;
  rsp_message?: unknown;
};

type UserInfoResponse = {
  rsp_code?: unknown;
  rsp_message?: unknown;
  res_list?: unknown;
};

export class OpenBankingOAuthError extends Error {
  constructor(message: string, public readonly providerStatus = 502) {
    super(message);
    this.name = "OpenBankingOAuthError";
  }
}

const readEnvironment = (name: string) => {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
};

export const getOpenBankingOAuthConfig = (): OpenBankingOAuthConfig => {
  const config = {
    baseUrl: readEnvironment("OPENBANKING_BASE_URL").replace(/\/$/, ""),
    clientId: readEnvironment("OPENBANKING_CLIENT_ID"),
    clientSecret: readEnvironment("OPENBANKING_CLIENT_SECRET"),
    redirectUri: readEnvironment("OPENBANKING_REDIRECT_URI"),
    scope: readEnvironment("OPENBANKING_SCOPE") || "login inquiry",
    authType: readEnvironment("OPENBANKING_AUTH_TYPE") || "0",
  };
  if (!config.baseUrl || !config.clientId || !config.clientSecret || !config.redirectUri) {
    throw new OpenBankingOAuthError("오픈뱅킹 OAuth 설정이 필요합니다.", 503);
  }
  return config;
};

export const createOpenBankingOAuthState = () =>
  randomBytes(OAUTH_STATE_LENGTH / 2).toString("hex");

export const createOpenBankingAuthorizationUrl = (state: string) => {
  const config = getOpenBankingOAuthConfig();
  const url = new URL(AUTHORIZE_PATH, `${config.baseUrl}/`);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: config.scope,
    state,
    auth_type: config.authType,
  }).toString();
  return url;
};

const providerErrorMessage = (payload: TokenResponse | UserInfoResponse, fallback: string) =>
  typeof payload.rsp_message === "string" && payload.rsp_message.trim()
    ? payload.rsp_message.trim()
    : fallback;

export const exchangeOpenBankingAuthorizationCode = async (code: string): Promise<OpenBankingCredential> => {
  const config = getOpenBankingOAuthConfig();
  const response = await fetch(new URL(TOKEN_PATH, `${config.baseUrl}/`), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });

  const payload = await readJson<TokenResponse>(response);
  if (!response.ok || (typeof payload.rsp_code === "string" && payload.rsp_code !== "A0000")) {
    throw new OpenBankingOAuthError(providerErrorMessage(payload, "오픈뱅킹 토큰을 발급받지 못했습니다."), response.status);
  }

  const accessToken = typeof payload.access_token === "string" ? payload.access_token : "";
  const userSequenceNumber = typeof payload.user_seq_no === "string" ? payload.user_seq_no : "";
  if (!accessToken || !userSequenceNumber) {
    throw new OpenBankingOAuthError("오픈뱅킹 토큰 응답을 확인해 주세요.");
  }

  const accounts = await loadOpenBankingAccounts(config, accessToken, userSequenceNumber);
  const configuredFintechUseNumber = readEnvironment("OPENBANKING_FINTECH_USE_NUM");
  const eligibleAccounts = accounts.filter((account) => account.inquiryEnabled);
  const configuredAccount = eligibleAccounts.find(
    (account) => account.fintechUseNumber === configuredFintechUseNumber,
  );

  return {
    accessToken,
    refreshToken: typeof payload.refresh_token === "string" ? payload.refresh_token : null,
    expiresAt: Date.now() + parseExpiresIn(payload.expires_in) * 1_000,
    userSequenceNumber,
    scope: typeof payload.scope === "string" ? payload.scope : config.scope,
    accounts,
    selectedFintechUseNumber: configuredAccount?.fintechUseNumber
      ?? (eligibleAccounts.length === 1 ? eligibleAccounts[0].fintechUseNumber : null),
  };
};

const loadOpenBankingAccounts = async (
  config: OpenBankingOAuthConfig,
  accessToken: string,
  userSequenceNumber: string,
): Promise<OpenBankingAccount[]> => {
  const url = new URL(USER_INFO_PATH, `${config.baseUrl}/`);
  url.searchParams.set("user_seq_no", userSequenceNumber);
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });
  const payload = await readJson<UserInfoResponse>(response);
  if (!response.ok || (typeof payload.rsp_code === "string" && payload.rsp_code !== "A0000")) {
    throw new OpenBankingOAuthError(providerErrorMessage(payload, "등록 계좌를 불러오지 못했습니다."), response.status);
  }
  if (!Array.isArray(payload.res_list)) return [];
  return payload.res_list.flatMap(normalizeAccount);
};

const normalizeAccount = (value: unknown): OpenBankingAccount[] => {
  if (!value || typeof value !== "object") return [];
  const row = value as Record<string, unknown>;
  const fintechUseNumber = typeof row.fintech_use_num === "string" ? row.fintech_use_num.trim() : "";
  if (!fintechUseNumber) return [];
  return [{
    fintechUseNumber,
    bankName: typeof row.bank_name === "string" && row.bank_name.trim() ? row.bank_name.trim() : "금융기관",
    accountAlias: typeof row.account_alias === "string" && row.account_alias.trim() ? row.account_alias.trim() : null,
    accountNumberMasked: typeof row.account_num_masked === "string" ? row.account_num_masked.trim() : "",
    inquiryEnabled: row.inquiry_agree_yn !== "N",
  }];
};

const parseExpiresIn = (value: unknown) => {
  const seconds = typeof value === "number" ? value : Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 60 * 60;
};

const readJson = async <T>(response: Response): Promise<T> => {
  try {
    return await response.json() as T;
  } catch {
    throw new OpenBankingOAuthError("오픈뱅킹 응답을 읽지 못했습니다.", response.status);
  }
};
