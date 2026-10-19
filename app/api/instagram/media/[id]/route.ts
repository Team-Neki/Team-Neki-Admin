import { requireAdminApi } from "../../../../server/auth/admin-access";
import { getInstagramMediaDetail } from "../../instagram-content-server";
import { instagramFailure } from "../../instagram-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  try {
    return Response.json(await getInstagramMediaDetail((await context.params).id), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return instagramFailure(error); }
}
