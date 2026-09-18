# Neki Admin

네키 서비스 운영자를 위한 관리자 페이지입니다. 기존 Figma 기반 토큰과 Ant Design 구성 위에 사용자 지표, 수동 알림, 부스 관리, 브랜드 관리, 포즈 관리, Amplitude 지표 조회 업무 흐름을 구현했습니다.

## 현재 범위

- 고정 사이드바와 프로필 영역
- DAU·WAU·MAU 실제 Amplitude 집계, 일·주·월 기준 기간 선택, 플랫폼별 활성 사용자 추이
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

운영 CRUD와 포즈 업로드는 `app/admin/mock-admin-data.ts`의 시드 데이터와 브라우저 저장 기반 adapter를 사용합니다. 대시보드와 Amplitude 지표 화면은 내부 API route를 통해 Amplitude Dashboard REST API를 직접 호출합니다.

Amplitude 연동에는 `AMPLITUDE_API_KEY`, `AMPLITUDE_SECRET_KEY`, `AMPLITUDE_REGION`, `AMPLITUDE_TIME_ZONE`, `AMPLITUDE_PROJECT_START_DATE`를 서버 환경에 설정합니다. API 키와 Secret은 브라우저로 전달하지 않습니다. 지표 API는 31개 이벤트를 `event_type`으로 묶어 총 발생과 고유 사용자를 각각 한 번에 조회하며, 대시보드는 활성·신규 사용자 API를 사용합니다. 동일 요청 병합, 1개 동시 호출 제한, 서버 캐시를 적용하고 실패 시 목 데이터로 대체하지 않습니다. 운영에서는 `AMPLITUDE_CACHE_DIR=/app/.data/amplitude`에 완료된 일별 지표와 선택 기간 집계를 JSON으로 원자적 저장합니다. 이 경로는 `neki-admin-web-data` PVC에 연결되어 모든 운영자가 같은 캐시를 사용하며 재배포 후에도 유지됩니다. 오늘 데이터는 기존 TTL에 따라 갱신하고 완료된 과거 기간은 저장된 결과를 재사용합니다.

렌더 검증용으로 URL에 `state=empty` 또는 `state=error`를 추가하면 목록의 빈 화면과 조회 오류 상태를 재현할 수 있습니다.

## 실행

Node.js 22.13 이상이 필요합니다.

```bash
npm install
npm run dev
```

기본 개발 주소는 `http://localhost:3000`입니다.

## 서버 호스팅

단일 Node.js 서버에서는 아래 명령으로 실행합니다.

```bash
npm ci
npm run build
npm start
```

`next.config.ts`는 `standalone` 출력을 생성합니다.

```bash
docker build -t neki-admin .
docker run --env-file .env.local -p 3000:3000 neki-admin
```

운영에서는 Next.js 프로세스 앞에 TLS와 요청 제한을 담당하는 Nginx 등의 리버스 프록시를 둡니다.

## 검증

```bash
npm run build
npm test
npm run lint
```

## 주요 파일

- `app/page.tsx`: 어드민 애플리케이션 진입점
- `app/admin/AdminApp.tsx`: 공통 셸과 사용자 지표·수동 알림·부스·브랜드·포즈·지표·QR 파싱 화면
- `app/admin/admin-adapter.ts`: mock/API 구현체를 선택하는 단일 조립 지점
- `app/admin/api-admin-adapter.ts`: Amplitude 지표 API와 기존 목 adapter를 조합하는 구현체
- `app/api/admin-api/admin-api-proxy.ts`: 추후 운영 CRUD 백엔드 연결에 사용할 서버 전용 경계
- `app/api/amplitude/amplitude-client.ts`: Amplitude 인증·직렬화·요청 캐시 경계
- `app/api/amplitude/amplitude-file-cache.ts`: PVC 기반 일별·기간별 JSON 캐시
- `app/api/amplitude/metrics/amplitude-metrics-server.ts`: 이벤트 발생·고유 사용자 집계
- `app/api/amplitude/dashboard/amplitude-dashboard-server.ts`: DAU·WAU·MAU·플랫폼 집계
- `app/admin/mock-admin-data.ts`: 검색·필터·페이지네이션 검증용 프로토타입 시드 데이터
- `app/admin/mock-admin-adapter.ts`: 메모리 기반 목 조회·변경 구현체
- `app/admin/types.ts`: 화면 모델과 구현체 공통 `AdminAdapter` 계약
- `public/poses/`: 프로토타입용 포즈 이미지 시드
- `app/globals.css`: Figma 기반 디자인 토큰과 화면 스타일
- `app/layout.tsx`: 문서 메타데이터와 공유 미리보기 설정
- `design-qa.md`: 원본과 구현 렌더를 함께 비교한 시각 QA 결과
- `docs/superpowers/specs/2026-08-01-admin-frontend-foundation-design.md`: 프론트엔드 기반 설계
- `Dockerfile`: Next.js standalone 서버 이미지
