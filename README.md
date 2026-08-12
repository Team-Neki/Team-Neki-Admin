# Neki Admin

네키 서비스 운영자를 위한 관리자 페이지입니다. 기존 Figma 기반 토큰과 Ant Design 구성 위에 사용자 지표, 수동 알림, 부스 관리, 브랜드 관리, 포즈 관리, Amplitude 지표 조회 업무 흐름을 구현했습니다.

## 현재 범위

- 고정 사이드바와 프로필 영역
- DAU·WAU·MAU, 일·주·월 기준 기간 선택, 전체·Android·iOS 누적 사용자 추이
- 수동 알림 즉시·예약 발송, 예상 인원 확인, 발송 이력·상세·예약 취소
- 부스 검색·필터, 등록·상세·수정, 선택 모드 기반 일괄 폐점 처리
- 전체 브랜드의 Android QR·iOS QR·지도 표시 상태, 3행 체크박스 조합 필터, 브랜드 추가·수정
- 포즈 이미지 다중 업로드·미리보기, 이미지 목록과 1~4인 필터
- 지표 탭에서 Amplitude 이벤트 31개를 기능 영역·페이지·파라미터별 조회
- 브랜드 관리에서 Android·iOS QR 파싱 로직과 이미지 획득 규칙 조회
- 조회 로딩·빈 화면·오류·재시도와 작업 성공·실패 상태
- Figma 기반 컬러, Pretendard 타이포, 8/12/20/999px 반경 토큰
- 반응형 레이아웃

## Ant Design 기준

- `antd@6.5.3`과 공식 Ant Design Skill/CLI를 기준으로 컴포넌트 API와 사용 예시를 확인합니다.
- 전역 디자인 값은 `ConfigProvider`의 `theme.token`으로 관리하고, 메시지·모달·알림은 `App.useApp()` 컨텍스트에서 호출합니다.
- 복수 조건 필터는 `Checkbox.Group`, 한 축의 보기 전환은 `Segmented`, 기준 기간 선택은 `DatePicker`, 목록 일괄 작업은 `Table.rowSelection`을 사용합니다. 데이터 목록은 열 `responsive`와 `scroll` 설정으로 화면 폭에 대응합니다.
- 공식 문서: [For Agents](https://ant.design/docs/react/for-agents/) · [Checkbox](https://ant.design/components/checkbox/) · [DatePicker](https://ant.design/components/date-picker/) · [Segmented](https://ant.design/components/segmented/) · [Table](https://ant.design/components/table/) · [Theme](https://ant.design/docs/react/customize-theme/)

운영 CRUD와 포즈 업로드는 `app/admin/mock-admin-data.ts`의 시드 데이터와 메모리 기반 adapter를 사용합니다. 지표 화면의 새로고침은 서버 API route를 통해 Amplitude 데이터를 조회하며, API 키가 없으면 설정 안내 상태를 표시합니다. 포즈 업로드는 브라우저 메모리에만 저장되어 새로고침하면 초기화됩니다.

Amplitude 조회 키는 `.env.local` 또는 배포 환경의 `AMPLITUDE_API_KEY`, `AMPLITUDE_SECRET_KEY`로 설정합니다. EU 리전에 있는 프로젝트만 `AMPLITUDE_REGION=eu`로 지정합니다.

렌더 검증용으로 URL에 `state=empty` 또는 `state=error`를 추가하면 목록의 빈 화면과 조회 오류 상태를 재현할 수 있습니다.

## 실행

Node.js 22.13 이상이 필요합니다.

```bash
npm install
npm run dev
```

기본 개발 주소는 `http://localhost:3000`입니다.

## 검증

```bash
npm run build
npm test
npm run lint
```

## Sprint MCP (Codex)

이 저장소에는 Codex 프로젝트 범위의 Sprint MCP 설정이 포함돼 있습니다. 먼저 Sprint의
**프로필 → API 토큰**에서 개인 토큰을 발급한 뒤, 커밋되지 않는 `.env.local`에 저장합니다.

```bash
cp .env.local.example .env.local
# .env.local의 SPRINT_API_TOKEN을 실제 sprint_pat_... 값으로 교체
```

그다음 이 프로젝트를 신뢰하고 Codex를 재시작하면 `sprint` MCP 서버가 로드됩니다.
요청 범위인 티켓 4개, 위키 4개, 조회 보조 3개 도구만 허용했습니다. npm 패키지에 추가로
포함된 에픽·프로젝트·스프린트·댓글 도구는 노출하지 않으며, `delete_ticket`과
`delete_epic`도 프로젝트 설정에서 명시적으로 차단했습니다.

- 설정: `.codex/config.toml`
- 실행 패키지: `@neki-team/sprint-mcp@0.2.0`
- API: `https://sprint.suitestudy.com:4641`
- 토큰은 `.env.local` 또는 실행 환경의 `SPRINT_API_TOKEN`에서만 읽습니다.

## 주요 파일

- `app/page.tsx`: 어드민 애플리케이션 진입점
- `app/admin/AdminApp.tsx`: 공통 셸과 사용자 지표·수동 알림·부스·브랜드·포즈·지표·QR 파싱 화면
- `app/admin/admin-adapter.ts`: mock/API 구현체를 선택하는 단일 조립 지점
- `app/admin/api-admin-adapter.ts`: 지표 새로고침과 기존 목 adapter를 조합하는 구현체
- `app/api/amplitude/metrics/route.ts`: 서버에서 Amplitude 조회 API를 호출하는 route
- `app/admin/mock-admin-data.ts`: 검색·필터·페이지네이션 검증용 프로토타입 시드 데이터
- `app/admin/mock-admin-adapter.ts`: 메모리 기반 목 조회·변경 구현체
- `app/admin/types.ts`: 화면 모델과 구현체 공통 `AdminAdapter` 계약
- `public/poses/`: 프로토타입용 포즈 이미지 시드
- `app/globals.css`: Figma 기반 디자인 토큰과 화면 스타일
- `app/layout.tsx`: 문서 메타데이터와 공유 미리보기 설정
- `design-qa.md`: 원본과 구현 렌더를 함께 비교한 시각 QA 결과
- `docs/superpowers/specs/2026-08-01-admin-frontend-foundation-design.md`: 프론트엔드 기반 설계
