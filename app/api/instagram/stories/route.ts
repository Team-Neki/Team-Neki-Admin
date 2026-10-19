import { requireAdminApi } from "../../../server/auth/admin-access";
import { getInstagramStories, parseInstagramContentQuery } from "../instagram-content-server";
import { instagramFailure } from "../instagram-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  try {
    return Response.json(await getInstagramStories(parseInstagramContentQuery(new URL(request.url).searchParams)), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return instagramFailure(error); }
}
