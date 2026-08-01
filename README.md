# Neki Admin

네키 서비스 운영자를 위한 관리자 페이지 초안입니다. Figma의 Color System, Text Styles, Radius 섹션을 코드 토큰으로 옮기고 Ant Design 컴포넌트에 연결했습니다.

## 현재 범위

- 고정 사이드바와 상단 검색·프로필 영역
- 회원, 콘텐츠, 신고, 이벤트, 공지 메뉴 구조
- 주요 운영 지표 카드
- 주간 활동과 월간 목표 시각화
- 최근 신고·문의·콘텐츠·회원 요청 테이블
- Figma 기반 컬러, Pretendard 타이포, 8/12/20/999px 반경 토큰
- 반응형 레이아웃

현재 데이터와 메뉴 동작은 디자인 검증용 목업입니다. 실제 API, 인증, 관리자 권한, 메뉴 정보 구조는 백엔드 계약과 운영 정책이 확정되면 연결합니다.

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

- `app/page.tsx`: 어드민 대시보드 골격과 Ant Design 테마
- `app/globals.css`: Figma 기반 디자인 토큰과 화면 스타일
- `app/layout.tsx`: 문서 메타데이터와 공유 미리보기 설정
- `docs/superpowers/specs/2026-08-01-admin-frontend-foundation-design.md`: 프론트엔드 기반 설계
