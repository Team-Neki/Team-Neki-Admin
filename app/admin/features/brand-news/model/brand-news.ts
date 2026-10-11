import type { BrandNewsRecord, BrandNewsSource } from "../../../types";

export const categoryLabel: Record<BrandNewsRecord["category"], string> = { collaboration: "콜라보", frame: "프레임", event: "이벤트", partnership: "제휴", news: "소식" };
export const statusLabel: Record<BrandNewsSource["status"], string> = { ok: "정상", cached: "저장본", partial: "일부 실패", error: "수집 실패", deferred: "재시도 대기", pending: "수집 전" };
export const failureLabel: Record<string, string> = { "rate-limited": "요청 제한", "login-required": "로그인 필요", "challenge-required": "인증 필요", "access-denied": "접근 거부", "layout-changed": "파싱 확인 필요", "deadline-exceeded": "시간 초과", "http-error": "요청 실패", "partial-metadata": "메타데이터 확인 필요" };
export const formatNewsTime = (value: string | null) => value ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";

export function filterNews(records: BrandNewsRecord[], filters: { brand: string; query: string; sort: string; direction: string }) {
  const query = filters.query.trim().toLocaleLowerCase("ko-KR");
  return records.filter((record) => (filters.brand === "all" || record.brandId === filters.brand) && (!query || `${record.title} ${record.brandName}`.toLocaleLowerCase("ko-KR").includes(query)))
    .sort((a, b) => {
      const order = filters.sort === "brand" ? a.brandName.localeCompare(b.brandName, "ko") : (a.publishedOn ?? "").localeCompare(b.publishedOn ?? "");
      return (filters.direction === "ascend" ? order : -order) || a.id.localeCompare(b.id);
    });
}
