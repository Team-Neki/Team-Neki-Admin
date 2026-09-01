import { apiAdminAdapter } from "./api-admin-adapter";
import type { AdminAdapter } from "./types";

/**
 * 애플리케이션 데이터 구현체를 선택하는 단일 조립 지점입니다.
 *
 * 운영 CRUD는 목 구현체를 유지하고, 지표 새로고침은 서버의 Amplitude API route를 호출합니다.
 */
export const adminAdapter: AdminAdapter = apiAdminAdapter;
