import { requireAdminApi } from "../../../server/auth/admin-access";
import { InstagramApiError } from "../instagram-client";
import { getInstagramMetrics, parseInstagramRange } from "../instagram-metrics-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  try {
    const range = parseInstagramRange(new URL(request.url).searchParams);
    return Response.json(await getInstagramMetrics(range), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const failure = error instanceof InstagramApiError ? error : new InstagramApiError("instagram_request_failed", "Instagram 지표를 불러오지 못했습니다.");
    return Response.json({ code: failure.code, message: failure.message, retryAfter: failure.retryAfter }, {
      status: failure.status,
      headers: { "Cache-Control": "private, no-store", ...(failure.retryAfter ? { "Retry-After": String(failure.retryAfter) } : {}) },
    });
  }
}
