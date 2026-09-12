import "server-only";

import { createHash } from "node:crypto";

export type OpenBankingAccount = {
  fintechUseNumber: string;
  bankName: string;
  accountAlias: string | null;
  accountNumberMasked: string;
  inquiryEnabled: boolean;
};

export type OpenBankingCredential = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
  userSequenceNumber: string;
  scope: string;
  accounts: OpenBankingAccount[];
  selectedFintechUseNumber: string | null;
};

type OpenBankingCredentialStore = {
  credential: OpenBankingCredential | null;
  authorizationError: string | null;
};

const globalStore = globalThis as typeof globalThis & {
  __nekiOpenBankingCredentialStore?: OpenBankingCredentialStore;
};

const store = globalStore.__nekiOpenBankingCredentialStore ??= {
  credential: null,
  authorizationError: null,
};

export const accountSelectionId = (fintechUseNumber: string) =>
  createHash("sha256").update(fintechUseNumber).digest("hex").slice(0, 24);

export const saveOpenBankingCredential = (credential: OpenBankingCredential) => {
  store.credential = credential;
  store.authorizationError = null;
};

export const readOpenBankingCredential = () => store.credential;

export const selectOpenBankingAccount = (accountId: string) => {
  const credential = store.credential;
  if (!credential) return false;
  const account = credential.accounts.find(
    (candidate) => accountSelectionId(candidate.fintechUseNumber) === accountId && candidate.inquiryEnabled,
  );
  if (!account) return false;
  credential.selectedFintechUseNumber = account.fintechUseNumber;
  store.authorizationError = null;
  return true;
};

export const setOpenBankingAuthorizationError = (message: string) => {
  if (!store.credential) store.authorizationError = message;
};

export const readOpenBankingAuthorizationError = () => store.authorizationError;
