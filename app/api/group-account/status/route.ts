import { getGroupAccountStatus } from "../group-account-server";

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "private, max-age=60",
  },
});

export async function GET() {
  try {
    return json(await getGroupAccountStatus());
  } catch {
    return json({ code: "group_account_status_failed", message: "계좌 연결 상태를 확인하지 못했습니다." }, 502);
  }
}
