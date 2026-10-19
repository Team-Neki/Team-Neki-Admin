import type { BrandNewsResponse } from "../../../types";
import { authenticatedFetch } from "../../../shared/api/authenticated-fetch";

export async function fetchBrandNews(signal: AbortSignal): Promise<BrandNewsResponse> {
  const response = await authenticatedFetch("/api/brand-news", { cache: "no-store", signal });
  if (!response.ok) throw new Error("브랜드 소식을 불러오지 못했습니다.");
  return response.json() as Promise<BrandNewsResponse>;
}
