# 관리자 Google 로그인

## 접근 정책

- 2026-10-19 사용자 요청으로 Google 로그인을 로컬·운영 모두 기본 비활성화했다. `ADMIN_AUTH_ENABLED=true`일 때만 아래 인증 정책을 적용한다. 나머지 값/미설정에서는 화면·데이터 API가 익명 접근을 허용하고 로그인 화면은 원래 화면으로 이동하며 인증 API는 404다. 프로필·로그아웃·세션 검사도 표시/실행하지 않는다. 가짜 관리자나 테스트 쿠키는 만들지 않는다.
- 비활성 상태는 접근 제한이 없는 공개 관리자이므로 URL을 아는 누구나 지표와 연결된 데이터 API를 조회할 수 있다. 공개 운영 전환 시 이를 고려해야 한다. 환경변수는 요청 헤더/쿼리가 아닌 서버 설정에서만 읽는다. `true`로 복구하면 설정 누락 시 다시 차단하며, 모든 인스턴스를 재시작해야 한다.
- Google OAuth/OIDC로 확인한 `emailVerified: true` 이메일과 서버 `ADMIN_ALLOWED_EMAILS`의 정확한 일치만 허용한다.
- 목록은 쉼표로 구분하고 앞뒤 공백 제거·소문자 정규화를 적용한다. Gmail의 점/플러스 별칭을 합치거나 도메인 전체·와일드카드를 허용하지 않는다.
- 인증 활성 상태에서는 설정 누락, 빈 목록, 인증 확인 오류를 차단한다. 로컬·운영 모두 동일하다.
- 로그인 콜백과 매 화면/API 요청에서 권한을 확인한다. 목록에서 제거된 계정은 설정이 적용된 모든 인스턴스에서 기존 세션으로 접근할 수 없다.
- 권한은 모두 동일한 관리자 권한이다. 사용자 관리 화면, 역할 등급, 비밀번호 로그인, 가입, 계정 연결 기능은 제공하지 않는다.

## 환경변수

`.env.local.example`의 인증 항목을 로컬 `.env.local` 또는 운영 Kubernetes Secret에 설정한다. 모두 서버 전용이고 `NEXT_PUBLIC_` 접두사를 사용하지 않는다.

| 변수 | 값 |
| --- | --- |
| `ADMIN_AUTH_ENABLED` | 기본 `false`. 임시 중단 해제 시 `true`로 설정하고 아래 다섯 변수도 준비 |
| `BETTER_AUTH_URL` | 운영: `https://admin-web.suitestudy.com:4641`, 로컬: 실제 사용하는 `http://localhost:<port>` |
| `BETTER_AUTH_SECRET` | 암호학적 난수로 생성한 32자 이상 비밀값, 모든 파드가 동일하게 사용 |
| `GOOGLE_CLIENT_ID` | Google OAuth 웹 애플리케이션 클라이언트 ID |
| `GOOGLE_CLIENT_SECRET` | 해당 클라이언트 Secret |
| `ADMIN_ALLOWED_EMAILS` | 예: `operator@example.com,another@example.com` |

비밀값은 저장소, 브라우저 저장소, 로그, PR 본문에 남기지 않는다. 기존 외부 서비스 키를 인증용 Secret으로 재사용하지 않는다. 로그인 요청의 Host/forwarded 헤더가 아닌 `BETTER_AUTH_URL`로 OAuth 원점과 콜백을 결정한다. 비로컬 주소는 HTTPS만 허용한다.

## Google Cloud 설정

1. Google Auth Platform에서 운영용 OAuth 동의 화면과 웹 애플리케이션 클라이언트를 생성한다. 외부 Gmail 계정을 허용한다면 External 대상을 사용한다.
2. 요청 범위는 `openid email profile`뿐이다. Drive, Gmail, 오프라인 토큰 권한을 요청하지 않는다.
3. 승인된 리디렉션 URI에 다음 주소를 정확히 등록한다. 포트도 일치해야 한다.

   `https://admin-web.suitestudy.com:4641/api/auth/callback/google`

4. 로컬 로그인 검증에는 사용하는 로컬 원점의 `/api/auth/callback/google`도 별도로 등록한다. 프로덕션·로컬 클라이언트 분리를 권장한다.
5. GCP 테스트 사용자 목록은 앱 접근 권한의 대체 수단이 아니다. 기본 신원 확인 범위에는 예외가 있으므로 서버 화이트리스트를 반드시 유지한다.

공식 근거: [Google OAuth 앱 상태](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview), [Google 웹 서버 OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Better Auth Google](https://better-auth.com/docs/authentication/google).

## 런타임과 API

- Better Auth 1.7.7의 stateless 구성으로 별도 DB 없이 운영한다. Google 프로필·토큰 검증과 state/PKCE 처리는 라이브러리에 맡긴다.
- 세션은 암호화된 JWE 쿠키와 서명된 세션 토큰으로 검증한다. 최대 8시간이며 자동 연장하지 않는다. provider 토큰 보관용 account cookie는 비활성화한다.
- 쿠키는 `HttpOnly`, `SameSite=Lax`, 경로 `/`를 사용한다. HTTPS 운영에서는 `Secure`와 `__Secure-` 접두사를 사용하고 하위 도메인 공유를 하지 않는다.
- Proxy에서 전체 접근을 먼저 검사하며, 각 데이터 Route Handler도 외부 호출 전에 동일한 guard를 실행한다. 비로그인 `401`, 권한 없음 `403`, 인증 설정/서비스 오류 `503`이고 오류 응답은 `no-store`이다.
- 인증된 데이터의 HTTP 캐시도 `private, no-store`로 제한한다. 로그아웃·계정 전환 후 브라우저 캐시로 권한 검사를 건너뛰지 않게 하되, 기존 서버 파일 캐시·호출 병합·클라이언트 메모리 캐시는 유지해 Amplitude 중복 호출은 방지한다.
- 인증 API는 Google 로그인 시작·콜백, 표시용 세션 조회, 로그아웃만 공개한다. `/api/auth/get-session`은 이름·이메일·만료 시간만 반환한다. 계정 연결·provider 토큰 조회·사용자 변경 경로는 `404`이다.
- 로그아웃과 로그인 시작은 POST 및 정확한 Origin 검사를 사용한다. 외부 복귀 주소와 인증/API 경로로의 복귀는 차단한다. 기존 관리자 `/?view=...` 및 필터는 유지한다.
- 브라우저는 만료, API `401/403`, 탭 재활성화 시 재인증으로 이동한다. 다른 탭의 로그아웃도 BroadcastChannel로 알린다. 네트워크 오류는 권한 없음과 혼동하지 않는다.
- 비밀값·세션은 localStorage에 저장하지 않는다. 기존 목 데이터 저장소와 공개 수집 데이터 브랜치는 이 기능의 보호 범위 밖이다. 별도 CRUD 백엔드의 직접 접근은 해당 백엔드에서도 인증해야 한다.

## 적용·회수

1. 인증 재활성화 전 OAuth 등록, 허용 이메일, 운영 Secret을 먼저 준비한다. `ADMIN_AUTH_ENABLED=true`인데 설정이 없으면 관리자 전체가 차단된다.
2. 배포 환경의 Secret에 다섯 환경변수를 추가하고 모든 파드를 재시작한다. GitHub Actions 빌드 시 비밀값 주입은 필요하지 않다.
3. 허용 계정 로그인과 미허용 계정 거부, 로그아웃, 쿠키 없는 지표·다운로드 접근 차단을 운영에서 확인한다.
4. 허용 목록을 바꾸면 Secret 변경 후 모든 파드를 재시작한다. 한 파드만 갱신하면 파드별 권한이 달라질 수 있다.

Stateless 세션은 개별 토큰의 서버 측 폐기 목록이 없다. 로그아웃은 현재 브라우저의 쿠키를 삭제하며, 이미 복제된 쿠키까지 중앙에서 폐기하지는 않는다. 계정 접근 회수는 이메일 제거로 처리하고, 전체 세션 강제 폐기는 `BETTER_AUTH_SECRET` 교체 후 모든 파드 재시작으로 처리한다. 이때 진행 중 OAuth 로그인도 다시 시작해야 한다.

## 검증

`npm run check`에서 활성 모드는 실제 서명·암호화한 테스트 세션으로 정상 API 회귀 검증과 별도의 익명·변조·만료·권한 회수·CSRF·로그아웃 테스트를 실행한다. 비활성 모드는 익명 화면/API 접근, 로그인 복귀 주소, 인증 API 중단, 가짜 프로필 미표시를 검증한다. 앱에 테스트 로그인 경로는 없다. 실제 Google 왕복 로그인은 등록된 OAuth 키와 허용 계정이 준비된 후 별도로 검증한다.

참고: [Next.js 인증](https://nextjs.org/docs/app/guides/authentication), [Better Auth stateless 세션](https://better-auth.com/docs/concepts/session-management).
