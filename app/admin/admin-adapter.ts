import { mockAdminAdapter } from "./mock-admin-adapter";
import type { AdminAdapter } from "./types";

/**
 * 애플리케이션 데이터 구현체를 선택하는 단일 조립 지점입니다.
 *
 * 프로토타입 단계에서는 mock 구현체만 사용합니다. 실제 API 연동 시
 * 같은 AdminAdapter 계약을 구현한 apiAdminAdapter로 이 한 줄만 교체합니다.
 */
export const adminAdapter: AdminAdapter = mockAdminAdapter;
