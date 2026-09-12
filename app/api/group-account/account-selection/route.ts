import { type NextRequest, NextResponse } from "next/server";

import { selectOpenBankingAccount } from "../open-banking-credential-store";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const accountId = form.get("accountId");
  const selected = typeof accountId === "string" && selectOpenBankingAccount(accountId);
  return NextResponse.redirect(
    new URL(`/?view=group-account&connection=${selected ? "connected" : "selection-error"}`, request.url),
    303,
  );
}
