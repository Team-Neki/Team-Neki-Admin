import { NextResponse } from "next/server";
import { readBrandNews } from "./brand-news-server";
import { requireAdminApi } from "../../server/auth/admin-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  try {
    return NextResponse.json(await readBrandNews(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "브랜드 소식 데이터를 불러오지 못했습니다." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
