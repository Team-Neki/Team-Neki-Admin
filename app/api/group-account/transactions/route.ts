import {
  getGroupAccountTransactions,
  GroupAccountProviderError,
  GROUP_ACCOUNT_PAGE_SIZE,
} from "../group-account-server";
import type { GroupAccountDirection } from "../../../admin/types";

const json = (body: Record<string, unknown>, status = 200, cacheControl = "private, max-age=60") => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": cacheControl,
  },
});

const isDate = (value: string | null): value is string => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));

const parseQuery = (request: Request) => {
  const params = new URL(request.url).searchParams;
  const from = params.get("from");
  const to = params.get("to");
  const direction = params.get("direction") ?? "all";
  const pageValue = Number(params.get("page") ?? "1");
  if (!isDate(from) || !isDate(to) || from > to) throw new Error("조회 기간을 확인해 주세요.");
  if (direction !== "all" && direction !== "in" && direction !== "out") throw new Error("입출금 필터를 확인해 주세요.");
  if (!Number.isInteger(pageValue) || pageValue < 1 || pageValue > 10_000) throw new Error("페이지를 확인해 주세요.");
  return { from, to, direction: direction as GroupAccountDirection, page: pageValue };
};

export async function GET(request: Request) {
  let query;
  try {
    query = parseQuery(request);
  } catch (error) {
    return json({ code: "invalid_group_account_query", message: error instanceof Error ? error.message : "조회 조건을 확인해 주세요." }, 400, "no-store");
  }

  try {
    return json(await getGroupAccountTransactions(query));
  } catch (error) {
    if (error instanceof GroupAccountProviderError) {
      if (error.providerStatus === 503) return json({ code: "group_account_not_configured", message: error.message }, 503, "no-store");
      if (error.providerStatus === 401 || error.providerStatus === 403) return json({ code: "group_account_consent_required", message: "계좌 연결이 만료되었거나 조회 동의가 필요합니다." }, 401, "no-store");
      if (error.providerStatus === 429) return json({ code: "group_account_rate_limited", message: "거래내역 조회 요청이 많습니다. 잠시 후 다시 시도해 주세요." }, 429, "no-store");
      return json({ code: "group_account_provider_failed", message: error.message }, 502, "no-store");
    }
    return json({ code: "group_account_request_failed", message: "거래내역을 불러오지 못했습니다." }, 502, "no-store");
  }
}

export const GROUP_ACCOUNT_RESPONSE_PAGE_SIZE = GROUP_ACCOUNT_PAGE_SIZE;
