import { normalizeOpenBankingTransaction } from "../../admin/group-account-adapter";
import type {
  GroupAccountQuery,
  GroupAccountStatus,
  GroupAccountTransaction,
  GroupAccountTransactionsResponse,
} from "../../admin/types";

type RuntimeEnv = Record<string, unknown>;

const PAGE_SIZE = 25;
const TRACE_CACHE_MAX_ENTRIES = 128;
const OPEN_BANKING_TRANSACTION_PATH = "/v2.0/account/transaction_list/fin_num";
const transactionTraceCache = new Map<string, string>();

export type GroupAccountRuntime = {
  mode: "live" | "mock";
  baseUrl: string;
  accessToken: string;
  fintechUseNumber: string;
  bankTranId: string;
};

export class GroupAccountProviderError extends Error {
  constructor(public readonly providerStatus: number, message: string) {
    super(message);
    this.name = "GroupAccountProviderError";
  }
}

const readRuntimeEnv = async (): Promise<RuntimeEnv> => {
  try {
    const workerModule = await import("cloudflare:workers");
    return workerModule.env as unknown as RuntimeEnv;
  } catch {
    return {};
  }
};

export const getGroupAccountRuntime = async (): Promise<GroupAccountRuntime> => {
  const runtime = await readRuntimeEnv();
  const read = (name: string) => {
    const value = runtime[name] ?? process.env[name];
    return typeof value === "string" ? value.trim() : "";
  };

  return {
    mode: read("GROUP_ACCOUNT_DATA_MODE").toLowerCase() === "mock" ? "mock" : "live",
    baseUrl: read("OPENBANKING_BASE_URL").replace(/\/$/, ""),
    accessToken: read("OPENBANKING_ACCESS_TOKEN"),
    fintechUseNumber: read("OPENBANKING_FINTECH_USE_NUM"),
    bankTranId: read("OPENBANKING_BANK_TRAN_ID"),
  };
};

const mockTransactions: GroupAccountTransaction[] = [
  {
    id: "20260826102030-0",
    occurredAt: "2026-08-26T10:20:30+09:00",
    description: "네키 운영비",
    direction: "out",
    amount: 120000,
    balanceAfter: 880000,
  },
  {
    id: "20260825183000-1",
    occurredAt: "2026-08-25T18:30:00+09:00",
    description: "모임통장 회비",
    direction: "in",
    amount: 50000,
    balanceAfter: 1000000,
  },
  {
    id: "20260824121500-2",
    occurredAt: "2026-08-24T12:15:00+09:00",
    description: "촬영 소품 구매",
    direction: "out",
    amount: 32000,
    balanceAfter: 950000,
  },
];

const toDateOnly = (value: string) => value.slice(0, 10);

const loadMockTransactions = (query: GroupAccountQuery): GroupAccountTransactionsResponse => {
  const filtered = mockTransactions.filter((transaction) => {
    const date = toDateOnly(transaction.occurredAt);
    const withinRange = date >= query.from && date <= query.to;
    const matchesDirection = query.direction === "all" || transaction.direction === query.direction;
    return withinRange && matchesDirection;
  });
  const start = (query.page - 1) * PAGE_SIZE;
  const items = filtered.slice(start, start + PAGE_SIZE);
  return {
    items,
    page: query.page,
    pageSize: PAGE_SIZE,
    hasNextPage: start + PAGE_SIZE < filtered.length,
    fetchedAt: new Date().toISOString(),
  };
};

const toProviderRows = (payload: unknown): unknown[] => {
  if (!payload || typeof payload !== "object") return [];
  const body = payload as Record<string, unknown>;
  if (Array.isArray(body.res_list)) return body.res_list;
  if (Array.isArray(body.data)) return body.data;
  return [];
};

const providerResponseStatus = (payload: unknown): string | null => {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as Record<string, unknown>).rsp_code;
  return typeof value === "string" ? value : null;
};

const transactionTraceKey = (runtime: GroupAccountRuntime, query: GroupAccountQuery, page: number) =>
  `${runtime.fintechUseNumber}:${query.from}:${query.to}:${query.direction}:${page}`;

const loadLiveTransactions = async (
  query: GroupAccountQuery,
  runtime: GroupAccountRuntime,
): Promise<GroupAccountTransactionsResponse> => {
  if (!runtime.baseUrl || !runtime.accessToken || !runtime.fintechUseNumber || !runtime.bankTranId) {
    throw new GroupAccountProviderError(503, "계좌 연결 정보가 없습니다.");
  }

  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now).reduce<Record<string, string>>((result, part) => {
    result[part.type] = part.value;
    return result;
  }, {});
  const tranDtime = `${parts.year}${parts.month}${parts.day}${parts.hour}${parts.minute}${parts.second}`;
  const inquiryType = query.direction === "in" ? "I" : query.direction === "out" ? "O" : "A";
  const previousTrace = query.page > 1
    ? transactionTraceCache.get(transactionTraceKey(runtime, query, query.page))
    : undefined;
  if (query.page > 1 && !previousTrace) {
    throw new GroupAccountProviderError(502, "다음 거래내역 페이지를 준비하지 못했습니다. 다시 조회해 주세요.");
  }
  const params = new URLSearchParams({
    bank_tran_id: runtime.bankTranId,
    fintech_use_num: runtime.fintechUseNumber,
    inquiry_type: inquiryType,
    inquiry_base: "D",
    from_date: query.from.replaceAll("-", ""),
    from_time: "000000",
    to_date: query.to.replaceAll("-", ""),
    to_time: "235959",
    sort_order: "D",
    tran_dtime: tranDtime,
    ...(previousTrace ? { befor_inquiry_trace_info: previousTrace } : {}),
  });
  const url = new URL(`${OPEN_BANKING_TRANSACTION_PATH}?${params.toString()}`, runtime.baseUrl);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${runtime.accessToken}`,
      },
    });
  } catch {
    throw new GroupAccountProviderError(502, "거래내역을 불러오지 못했습니다.");
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) throw new GroupAccountProviderError(response.status, "거래내역을 불러오지 못했습니다.");
  const responseCode = providerResponseStatus(payload);
  if (responseCode && responseCode !== "A0000") {
    throw new GroupAccountProviderError(502, "계좌 거래내역 조회가 거부되었습니다.");
  }

  const items = toProviderRows(payload)
    .map((row, index) => normalizeOpenBankingTransaction(row, index))
    .filter((item) => query.direction === "all" || item.direction === query.direction);
  const responseBody = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const nextTrace = typeof responseBody.befor_inquiry_trace_info === "string"
    ? responseBody.befor_inquiry_trace_info
    : null;
  const nextPage = responseBody.next_page_yn === "Y";
  if (nextPage && nextTrace) {
    while (transactionTraceCache.size >= TRACE_CACHE_MAX_ENTRIES) {
      transactionTraceCache.delete(transactionTraceCache.keys().next().value as string);
    }
    transactionTraceCache.set(transactionTraceKey(runtime, query, query.page + 1), nextTrace);
  }
  return {
    items,
    page: query.page,
    pageSize: PAGE_SIZE,
    hasNextPage: nextPage && Boolean(nextTrace),
    fetchedAt: new Date().toISOString(),
  };
};

export const getGroupAccountStatus = async (): Promise<GroupAccountStatus> => {
  const runtime = await getGroupAccountRuntime();
  if (runtime.mode === "mock") {
    return {
      state: "mock",
      accountLabel: "네키 모임통장",
      lastSyncedAt: new Date().toISOString(),
    };
  }
  if (!runtime.baseUrl || !runtime.accessToken || !runtime.fintechUseNumber || !runtime.bankTranId) {
    return { state: "unconfigured", message: "계좌 연결 정보가 없습니다." };
  }
  return { state: "connected", accountLabel: "토스 모임통장", lastSyncedAt: null };
};

export const getGroupAccountTransactions = async (
  query: GroupAccountQuery,
): Promise<GroupAccountTransactionsResponse> => {
  const runtime = await getGroupAccountRuntime();
  return runtime.mode === "mock"
    ? loadMockTransactions(query)
    : loadLiveTransactions(query, runtime);
};

export const GROUP_ACCOUNT_PAGE_SIZE = PAGE_SIZE;
