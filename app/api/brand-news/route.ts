import { NextResponse } from "next/server";
import { readBrandNews } from "./brand-news-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await readBrandNews(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "브랜드 소식 데이터를 불러오지 못했습니다." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
