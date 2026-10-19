import "server-only";
import { InstagramApiError } from "./instagram-client";

export function instagramFailure(error: unknown) {
  const failure = error instanceof InstagramApiError ? error : new InstagramApiError("instagram_request_failed", "Instagram 콘텐츠를 불러오지 못했습니다.");
  return Response.json({ code: failure.code, message: failure.message, retryAfter: failure.retryAfter }, {
    status: failure.status,
    headers: { "Cache-Control": "private, no-store", ...(failure.retryAfter ? { "Retry-After": String(failure.retryAfter) } : {}) },
  });
}
