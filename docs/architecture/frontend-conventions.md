# Neki Admin 프런트엔드 구조 규칙

## 결정

Neki Admin은 Next.js App Router 위에 경량 feature-first 구조를 사용한다. 전체 Feature-Sliced Design 계층을 도입하지 않고, 현재 규모에 필요한 `app shell`, `features`, `shared`, `contracts` 경계만 사용한다.

Next.js는 특정 프로젝트 구조를 강제하지 않으며 기능 또는 라우트 단위 분리를 공식 예시로 제공한다. React는 UI와 데이터 모델을 기준으로 컴포넌트 계층을 나누고, 한 컴포넌트의 책임이 커지면 분해하는 방식을 권장한다. 상태 동기화와 외부 시스템 연결은 목적이 분명한 custom Hook으로 추출한다. TypeScript 모듈은 명시적으로 export한 계약만 외부에 노출한다.

## 디렉터리

```text
app/
├── page.tsx                         # Next.js 진입점
├── layout.tsx                       # 전역 provider와 문서 골격
├── api/
│   └── <integration>/
│       ├── route.ts                 # HTTP 경계
│       └── <integration>-server.ts  # 서버 로직
└── admin/
    ├── AdminApp.tsx                 # 관리자 shell과 화면 조합
    ├── features/
    │   └── analytics/
    │       ├── index.ts             # 기능 공개 API
    │       ├── model/                # 상태, 훅, 도메인 계산
    │       └── ui/                   # 화면과 UI 컴포넌트
    ├── shared/
    │   └── ui/                       # 비즈니스 로직 없는 공용 UI
    ├── admin-adapter.ts             # 런타임 adapter 선택
    └── types.ts                     # 기능 경계를 넘는 계약
```

새 기능은 처음부터 모든 세그먼트를 만들지 않는다. UI만 있으면 `ui/`만 만들고, 상태 동기화나 계산이 생길 때 `model/`, 외부 요청이 기능 전용일 때 `api/`를 추가한다.

## 의존 규칙

```text
Next.js entry / AdminApp
          ↓
       features
          ↓
 shared UI / shared contracts
```

- 상위 계층만 하위 계층을 import한다.
- 한 feature는 다른 feature의 내부 파일을 import하지 않는다.
- feature 외부에서는 `features/<name>/index.ts`만 사용한다.
- feature 내부에서는 자기 `index.ts`를 import하지 않는다. 상대 경로로 실제 모듈을 참조해 순환 의존을 피한다.
- `shared`는 관리자 기능 이름, API 필드, 업무 상태를 알지 못한다.
- 공개 API는 필요한 이름만 명시적으로 export한다. wildcard export는 금지한다.

## 컴포넌트와 상태

- 화면은 데이터를 props로 받고 사용자 의도를 callback으로 전달한다.
- 입력 필터, 열린 모달처럼 화면 하나에만 필요한 상태는 화면에 둔다.
- 네트워크 요청, 요청 취소·경쟁 처리, 쿨다운, 타이머, 외부 저장소 동기화는 목적형 custom Hook으로 분리한다.
- 동일한 상태를 여러 위치에 복제하지 않는다. 상태별 소유자를 하나로 정하고 파생 값은 렌더링 중 계산하거나 `useMemo`로 계산한다.
- 컴포넌트 이름은 화면의 역할을 드러내고, 단순히 `Container`, `Manager`, `Utils`처럼 범위가 불명확한 이름을 만들지 않는다.
- 한 파일에서 서로 독립적으로 변경되는 화면·상태 로직이 함께 커지면 기능 경계로 분리한다. 줄 수 자체보다 변경 이유가 둘 이상인지가 분리 기준이다.

## 서버와 API

- `route.ts`는 URL·body 검증, 인증, HTTP 응답만 조립한다.
- 외부 API client, 캐시 정책, 데이터 정규화와 영속화는 별도 서버 모듈에 둔다.
- 실제 API 스펙이 확정되지 않은 값은 adapter 경계 안에 가두고 UI가 임의 필드에 직접 의존하지 않게 한다.
- 비밀키와 서버 전용 모듈은 Client Component에서 import하지 않는다.

## 파일·이름 규칙

- React 컴포넌트: `PascalCase.tsx`
- React Hook: `useCamelCase.ts`
- 일반 로직·서버 모듈: `kebab-case.ts`
- 테스트: 대상 파일과 가까운 의미의 `*.test.mjs`
- 타입 전용 import는 `import type`을 사용한다.
- `@/*`는 기능 외부의 공개 API를 참조할 때 사용하고, 같은 기능 내부는 상대 경로를 사용한다.

## 검증

```bash
npm run check
antd lint app/admin/<changed-file>.tsx --format json
```

`npm run check`는 타입 검사, ESLint, 전체 테스트와 프로덕션 빌드를 실행한다. 구조 변경에는 렌더링 테스트에서 기능 공개 API와 shell 조합 여부를 확인한다.

## 근거

- [Next.js 프로젝트 구조](https://nextjs.org/docs/app/getting-started/project-structure): App Router의 colocation, private folder, feature·route 단위 구성 방식
- [React: Thinking in React](https://react.dev/learn/thinking-in-react): UI를 책임별 컴포넌트 계층으로 분해하는 기준
- [React: Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks): 외부 시스템 동기화와 상태 로직의 목적형 Hook 추출
- [React: Sharing State Between Components](https://react.dev/learn/sharing-state-between-components): 상태별 단일 소유자 원칙
- [Next.js Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components): `use client` 모듈 그래프 경계
- [TypeScript Modules](https://www.typescriptlang.org/docs/handbook/2/modules.html): 명시적 import/export와 모듈 스코프
- [Feature-Sliced Design Layers](https://feature-sliced.design/docs/reference/layers): 책임과 의존 방향에 따른 계층화
- [Feature-Sliced Design Public API](https://feature-sliced.design/docs/reference/public-api): 기능 공개 API와 내부 상대 import 원칙
