# Toss Group Account Integration Design

## 목표

네키 관리자에서 토스 모임통장 거래내역을 조회할 수 있는 안전한 연동 경계를 만든다. 금융결제원 오픈뱅킹 이용기관 자격과 계좌 명의자 동의가 준비되기 전에는 실제 금융 데이터나 임의의 목 데이터를 사용자에게 노출하지 않고 `연결 전` 상태를 보여준다.

## 범위

- 관리자 내 `모임통장` 조회 화면
- 서버 전용 계좌 연동 어댑터와 거래내역 조회 route
- 연결 상태, 기간 필터, 입출금 필터, 페이지네이션, 잔액 표시
- 미설정·연결 중·연결됨·조회 중·내역 없음·오류 상태
- 개발 검증을 위한 명시적 mock 모드
- 금융결제원 오픈뱅킹 응답을 화면 모델로 변환하는 경계

다음은 이번 범위에서 제외한다.

- 토스 앱의 비공개 endpoint 호출
- 브라우저에 client secret 또는 access token 저장
- 금융결제원 이용기관 신청·계약·심사 자동화
- 계좌 연결 OAuth를 실제 자격 없이 흉내 내는 동작
- 거래내역 수정·이체·출금 기능

## 아키텍처

1. `AdminApp`은 기존 탭 라우팅과 데이터 adapter 패턴을 유지한 채 `모임통장` 화면을 추가한다.
2. `app/api/group-account` 아래 route가 서버에서만 `GroupAccountAdapter`를 호출한다.
3. 기본 adapter는 환경변수가 없을 때 `unconfigured`를 반환한다. `GROUP_ACCOUNT_DATA_MODE=mock`일 때만 고정 fixture를 반환해 UI 상태를 검증한다.
4. 실제 adapter는 금융결제원 오픈뱅킹의 계좌 등록 결과와 Access Token을 사용해 거래내역을 조회한다. 외부 API 필드명은 adapter 내부에서만 사용하고 화면에는 정규화된 타입만 전달한다.
5. 토큰과 client secret은 서버 환경변수 또는 이후 추가될 암호화 저장소에서만 다룬다. `localStorage`, query string, HTML 응답에는 넣지 않는다.

## 화면 동작

- `연결 전`: 연결 상태와 필요한 설정을 표시하고 거래내역 표는 렌더링하지 않는다.
- `연결됨`: 최근 조회 시각, 계좌 별칭, 잔액 요약, 기간 필터, 입출금 필터, 거래내역 표를 표시한다.
- `조회 중`: 필터와 새로고침 버튼을 잠그고 표 스켈레톤을 표시한다.
- `내역 없음`: 선택 기간과 필터를 유지한 채 빈 상태를 표시한다.
- `오류`: 사용자에게 재시도 버튼을 제공하고 서버의 secret·token 값은 노출하지 않는다.
- `mock`: 개발 환경에서만 fixture 거래내역을 사용하며 화면에 `목 데이터` 상태를 명시한다.

## 서버 계약

### 상태

`GET /api/group-account/status`

```ts
type GroupAccountStatus =
  | { state: 'unconfigured'; message: string }
  | { state: 'connected'; accountLabel: string; lastSyncedAt: string | null }
  | { state: 'mock'; accountLabel: string; lastSyncedAt: string };
```

### 거래내역

`GET /api/group-account/transactions?from=YYYY-MM-DD&to=YYYY-MM-DD&direction=all|in|out&page=1`

```ts
type GroupAccountTransaction = {
  id: string;
  occurredAt: string;
  description: string;
  direction: 'in' | 'out';
  amount: number;
  balanceAfter: number | null;
};

type GroupAccountTransactionsResponse = {
  items: GroupAccountTransaction[];
  page: number;
  pageSize: number;
  hasNextPage: boolean;
  fetchedAt: string;
};
```

실제 Open Banking의 페이지 크기와 커서/다음 페이지 값은 adapter에서 `page`와 `hasNextPage`로 변환한다. API 키 또는 동의 토큰이 없으면 route는 구성 오류를 503으로 반환한다.

## 오류·보안

- 401/403: 연결 만료 또는 동의 필요 상태로 변환
- 429: 잠시 후 재시도 안내와 서버측 재요청 금지
- 5xx/네트워크: 일반 오류 메시지와 재시도
- 모든 외부 호출에 제한 시간과 요청 중복 방지 적용
- 로그에는 계좌번호, access token, secret, 거래 상대방의 민감정보를 기록하지 않는다.

## 검증

- adapter 정규화와 상태 분기 단위 테스트
- API route의 미설정·mock·오류 응답 테스트
- 기존 렌더링 테스트에 `모임통장` 탭과 연결 전 상태 추가
- TypeScript, ESLint, build, 전체 테스트 실행
- 모바일 폭에서 탭·필터·표의 overflow 확인
