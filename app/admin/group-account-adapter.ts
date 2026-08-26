import type { GroupAccountTransaction } from "./types";

type ProviderTransaction = Record<string, unknown>;

function asRecord(input: unknown): ProviderTransaction {
  return typeof input === "object" && input !== null
    ? (input as ProviderTransaction)
    : {};
}

function asText(value: unknown): string | null {
  if (typeof value === "string" || typeof value === "number") {
    const text = String(value).trim();
    return text || null;
  }
  return null;
}

function parseAmount(value: unknown): number {
  const text = asText(value);
  if (!text) return 0;

  const amount = Number(text.replaceAll(",", ""));
  return Number.isFinite(amount) ? Math.abs(amount) : 0;
}

function parseBalance(value: unknown): number | null {
  const text = asText(value);
  if (!text) return null;

  const balance = Number(text.replaceAll(",", ""));
  return Number.isFinite(balance) ? balance : null;
}

function normalizeDate(value: unknown): string {
  const date = asText(value)?.replaceAll("-", "") ?? "";
  return /^\d{8}$/.test(date) ? date : "19700101";
}

function normalizeTime(value: unknown): string {
  const time = asText(value)?.replaceAll(":", "") ?? "";
  return /^\d{6}$/.test(time) ? time : "000000";
}

function formatOccurredAt(date: string, time: string): string {
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${time.slice(
    0,
    2,
  )}:${time.slice(2, 4)}:${time.slice(4, 6)}+09:00`;
}

function normalizeDirection(value: unknown): "in" | "out" {
  const direction = asText(value)?.toLowerCase();
  if (
    direction === "입금" ||
    direction === "in" ||
    direction === "inbound" ||
    direction === "credit" ||
    direction === "deposit" ||
    direction === "1"
  ) {
    return "in";
  }
  return "out";
}

function getDescription(transaction: ProviderTransaction): string {
  for (const key of ["print_content", "printed_content", "tran_content", "description", "content"]) {
    const text = asText(transaction[key]);
    if (text) return text;
  }
  return "거래";
}

/**
 * Converts a provider transaction into the screen-only model.
 * Provider identifiers and the original payload intentionally stay inside this function.
 */
export function normalizeOpenBankingTransaction(
  input: unknown,
  index: number,
): GroupAccountTransaction {
  const transaction = asRecord(input);
  const date = normalizeDate(transaction.tran_date);
  const time = normalizeTime(transaction.tran_time);

  return {
    id: `${date}${time}-${index}`,
    occurredAt: formatOccurredAt(date, time),
    description: getDescription(transaction),
    direction: normalizeDirection(transaction.inout_type),
    amount: parseAmount(transaction.tran_amt),
    balanceAfter: parseBalance(transaction.after_balance_amt ?? transaction.balance_amt),
  };
}
