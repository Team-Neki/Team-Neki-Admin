# Project UI rules

- 제품 UI에는 사용자 요청, 대화 맥락, 구현 배경을 설명하는 문구를 넣지 않는다.
- 화면에는 기능 수행에 필요한 최소한의 라벨·플레이스홀더·상태 메시지만 표시한다.
- 기능을 설명하는 긴 소개 문단이나 “왜 이 화면이 필요한지”를 해설하는 카피는 기획 문서에만 둔다.

# Frontend architecture rules

- `app/page.tsx`, `app/layout.tsx`, `app/admin/AdminApp.tsx`는 라우팅·프로바이더·화면 조합만 담당한다. 신규 화면 구현이나 외부 시스템 동기화 로직을 이 파일들에 추가하지 않는다.
- 관리자 기능은 `app/admin/features/<feature>/`에 둔다. 기본 세그먼트는 `ui/`, `model/`, `api/`이며 실제 코드가 있을 때만 만든다.
- 화면 컴포넌트는 렌더링과 사용자 입력을 담당한다. 네트워크 요청, 타이머, 캐시·쿨다운, 요청 경쟁 처리는 목적이 드러나는 전용 훅 또는 `model/` 모듈로 분리한다.
- 여러 기능에서 쓰는 UI와 기술 코드는 `app/admin/shared/`에 둔다. `shared`는 `features`나 `AdminApp`을 import할 수 없고 비즈니스 규칙을 포함하지 않는다.
- 의존 방향은 `app shell -> features -> shared/contracts` 단방향을 유지한다. 기능 간 직접 import는 금지하며, 필요한 공통 코드는 더 낮은 계층으로 옮긴다.
- 기능 외부에서는 해당 기능의 `index.ts` 공개 API만 import한다. 기능 내부에서는 `index.ts`를 우회해 상대 경로로 직접 import하고 `export *`는 사용하지 않는다.
- 공용 API·adapter 계약 타입은 `app/admin/types.ts`에 두고, 한 기능에서만 쓰는 UI 상태·상수·타입은 해당 기능 가까이에 둔다.
- API Route의 `route.ts`는 요청 파싱·응답 변환·상태 코드만 담당한다. Amplitude 호출, 캐시 정책, 데이터 변환은 인접한 서버 모듈로 분리한다.
- Client Component 경계는 필요한 가장 바깥 파일에만 선언하고, 서버 전용 모듈을 client module graph에서 import하지 않는다.
- 새 파일과 디렉터리는 역할이 드러나는 영어 이름을 사용한다. 컴포넌트는 `PascalCase.tsx`, 훅은 `useCamelCase.ts`, 일반 모듈은 `kebab-case.ts`를 사용한다.
- 변경 후 `npm run check`를 통과시킨다. Ant Design 컴포넌트를 변경하면 `antd lint <changed-files> --format json`도 실행한다.

세부 구조와 판단 기준은 `docs/architecture/frontend-conventions.md`를 따른다.
