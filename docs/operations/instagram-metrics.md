# NEKI Instagram 지표 연결

## 구현 범위

`neki_official_`의 지표를 공식 Instagram API with Instagram Login으로 조회한다. 브라우저 스크래핑이나 공개 게시물 수집기가 아니라, 계정 소유자가 허용한 조회 토큰을 Next.js 서버에서 사용하는 연동이다. 별도 수집 백엔드나 DB는 추가하지 않았다.

- 현재 팔로워, 선택 기간의 도달·좋아요·조회, 일별 도달 그래프.
- 날짜에 관계없는 계정 게시물 목록과 게시물별 누적 성과. 12개씩 명시적으로 더 불러온다.
- 피드 상세에서 전체 캡션, 좋아요·댓글 수, 캐러셀 사진·영상 최대 20개를 조회한다. 원본 링크는 별도다.
- 현재 게시 중인 스토리와 조회·도달·답글·공유 지표. 지난 스토리 아카이브는 제공하지 않는다.
- 조회 결과를 서버 JSON에 저장하고 같은 볼륨을 사용하는 운영자·서버가 재사용한다.
- 페이지 진입, 날짜 변경, 더 보기, 수동 새로고침으로 조회한다. 상시 백그라운드 수집·자정 작업·예약 스케줄은 없다.
- 코드와 로컬 실데이터 확인을 완료했으며, 운영 Secret 반영·배포는 별도다.

## 피드·스토리 추가 기능 (2026-10-19)

### 공식 근거와 범위

- [Meta Instagram 인사이트](https://developers.facebook.com/documentation/instagram-platform/insights): Instagram Login은 `instagram_business_basic`, `instagram_business_manage_insights`와 `graph.instagram.com`을 사용한다. 소유 계정의 표준 액세스 범위이며 새 게시·댓글·DM 권한을 요구하지 않는다.
- [미디어 인사이트](https://developers.facebook.com/documentation/instagram-platform/reference/instagram-media/insights): 스토리에 `views`, `reach`, `replies`, `shares`가 지원된다. 데이터는 최대 48시간 지연될 수 있고, 스토리 인사이트 조회 가능 시간은 24시간이다. 조회 인원이 부족한 스토리는 code 10과 `Not enough viewers` 오류로 제한된다. 이 오류를 권한 부족과 구분하고 값을 `—`로 표시한다. 답글 지표에는 지역별 집계 제한이 있다.
- [스토리 목록](https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/stories): 24시간 제공, 라이브·다른 스토리 재공유 제외. 이 문서의 권한 예시는 Facebook Login이므로 Instagram Login 권한과 혼용하지 않는다. 현재 토큰으로 `graph.instagram.com/.../stories` 200 응답을 별도 검증했다.
- [캐러셀 하위 미디어](https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-media/children): 부모 캐러셀의 `children`을 조회한다. 자식별 인사이트는 제공되지 않으므로 상세에서는 부모 지표만 사용한다.
- Instagram Login에는 `story_insights` Webhook이 지원되지 않는다. 따라서 만료 스토리 자동 보관·예약 수집·하이라이트 과거 데이터 복구를 약속하지 않는다. 현재 기능은 읽기 전용이다.

### 요청·화면 규칙

```http
GET /api/instagram/media/<numeric-media-id>
GET /api/instagram/stories
GET /api/instagram/stories?cursor=<after>
GET /api/instagram/stories?refresh=1
```

서버 모듈은 `instagram-content-server.ts`, HTTP 오류 변환은 `instagram-response.ts`에 둔다. 상세와 스토리 Route에도 관리자 guard가 있다. 상세 ID는 숫자만 허용하며, 서버 고정 계정의 프로필과 미디어 username을 검증한다. 타 계정·만료 스토리 상세는 404다. URL은 Instagram/Facebook 미디어 CDN HTTPS만 허용하며 token query를 거부한다. 공급자의 다음 페이지 URL을 그대로 노출하거나 호출하지 않는다.

피드 제목을 클릭하면 Ant Design 모달에서 전체 캡션과 미디어가 열린다. 캐러셀은 `children?limit=20`을 이때만 읽고, 다음·이전 버튼으로 이동한다. 이미지 기본값은 contain, 영상은 controls/playsInline이며 자동 재생하지 않는다. 원본 Instagram 이동은 별도 링크다. Escape·닫기 버튼으로 닫으면 트리거로 초점이 돌아간다.

콘텐츠 영역의 피드/스토리 탭은 `igTab=feed|stories` URL 상태다. 스토리 탭에 들어갈 때만 조회하므로 피드 진입에는 스토리 호출이 없다. 스토리는 최대 12개씩 명시적으로 더 불러오고, 서버가 현재 시각 기준 만료·미래 항목을 제외한다. 새로고침/탭 재진입 때 상태를 재확인한다. 기간 필터는 계정 합계·그래프 전용이며 스토리 게시 기간을 변경하지 않는다.

상세는 5분, 스토리 목록·지표는 1분 메모리 캐시와 기존 2개 동시 호출 제한·429 쿨다운을 공유한다. 열지 않은 상세·자식 미디어를 미리 읽지 않는다. 스토리/상세는 JSON 이력에 저장하지 않으며, 기존 계정 지표 스냅샷의 JSON 저장·새 게시물 감지는 유지한다. 스토리 UI의 게시 종료는 timestamp+24h 예정값이며 원본의 삭제/비공개 전환 시점까지 보장하지 않는다.

실제 계정으로 피드 9개, 첫 캐러셀 사진 5개, 상세 username/좋아요/댓글 응답과 스토리 목록 200(현재 0개)을 확인했다. 활성 스토리·동영상·적은 조회 인원·만료·타 계정·악성 URL은 API fixture로 추가 검증한다. 실제 활성 스토리 지표는 다음 스토리 게시 후 운영에서 추가 대조가 필요하다.

### 서버 전달

로컬 Git 제외 파일 `.data/private/instagram-production.env`에 실제 설정 5개를 준비했다. 파일 권한은 600이며 저장소·이미지에 포함하지 않는다. 담당자는 안전한 채널로 받은 값을 **기존** `prod/neki-admin-web-secret`의 `stringData`에 추가하고 나머지 키를 유지한다. Instagram 항목만 들어 있는 Secret을 `kubectl apply`로 덮어씌워 기존 키를 삭제하면 안 된다.

```bash
kubectl -n prod rollout restart deployment/neki-admin-web
kubectl -n prod rollout status deployment/neki-admin-web
```

GitHub Actions Secrets는 현행 이미지 빌드→GitOps 파이프라인에서 런타임 Secret으로 자동 전달되지 않는다. 토큰을 Docker build-arg/이미지 ENV/GitOps YAML 평문에 넣지 않는다. 서버 Secret 반영 전에는 운영 연동 완료로 보고하지 않는다. Google 로그인은 사용자 결정대로 기본 비활성 상태를 유지한다.

## 기존 앱과 계정

2026-10-19 Meta 개발자 콘솔에서 확인한 설정이다. 토큰 유효성이나 운영 배포 완료를 의미하지 않는다.

- Meta 앱: `NEKI Ads MCP` (`1525005415844958`)
- Instagram 앱: `NEKI Ads MCP-IG` (`1690000478767750`)
- 연결 계정: `neki_official_` (`17841447544847066`)
- 등록된 조회 권한: `instagram_business_basic`, `instagram_business_manage_insights`
- 위 두 권한의 API 호출 기록과 테스트 준비 상태를 확인했다. 앱은 게시되지 않은 상태다. 게시 여부만으로 소유 계정의 토큰 유효성·권한 여부를 단정하지 않는다.

새 앱은 생성하지 않았다. 게시·DM·댓글 관리 권한은 이 연동에 필요하지 않으며 추가하지 않는다. 계정 소식 공개 수집기와도 별개다.

## Meta 설정과 토큰 발급 절차

1. [Meta 앱의 Instagram API 설정](https://developers.facebook.com/apps/1525005415844958/use_cases/customize/API-Setup/?use_case_enum=INSTAGRAM_BUSINESS&product_route=instagram-business&selected_tab=API-Setup&business_id=1287961906779365)에서 기존 앱을 선택한다.
2. `Instagram 로그인이 포함된 API 설정`의 연결 계정에 `neki_official_`과 계정 ID가 있는지 확인한다. 앱 역할·연결 계정에 접근 가능한 소유자/운영자가 진행한다.
3. 계정 행의 `토큰 생성`을 누른다. Meta 로그인이 되어 있어도 Instagram 재로그인을 요구할 수 있다.
4. Instagram 동의 화면에서 **프로필 조회 및 미디어 액세스**, **인사이트 액세스 및 관리**만 남긴다. 기본적으로 켜져 있던 댓글·메시지·콘텐츠 게시 스위치는 모두 끈다. 앱 설정의 `모든 필수 권한 추가`는 이 작업에 필요하지 않다.
5. 발급 모달에서 일회 표시되는 토큰을 안전하게 복사해 서버 환경변수에 저장한다. 토큰을 문서·이슈·PR·메신저·스크린샷에 남기지 않는다.
6. 서버 재시작 후 아래 내부 API로 계정과 지표를 확인한다. 토큰 자체를 프런트엔드로 전달하지 않는다.

운영자가 토큰을 잃었거나 만료·취소된 경우 같은 절차로 교체한다. 실제 만료일을 확인한 뒤 별도로 관리해야 하며, 현재 자동 토큰 갱신은 구현하지 않았다. 앱 검수·다른 계정 연결·권한 확대는 이 소유 계정 검증과 별개다.

## 서버 환경변수

```dotenv
INSTAGRAM_ACCOUNT_ID=17841447544847066
INSTAGRAM_USERNAME=neki_official_
INSTAGRAM_ACCESS_TOKEN=
INSTAGRAM_GRAPH_API_VERSION=v26.0
INSTAGRAM_CACHE_DIR=/app/.data/amplitude/instagram
```

기존 앱의 Instagram Login 사용자 토큰을 사용한다. Facebook/Page 토큰을 혼용하지 않는다. 토큰은 `.env.local` 또는 운영 Secret에만 저장하고 서버를 재시작한다. `.env.local.example`에는 비밀값을 넣지 않는다. `NEXT_PUBLIC_`, 클라이언트 저장소, URL, Git, 스크린샷, 로그로 토큰을 전달하지 않는다.

토큰 발급 화면에서 실제 동의 권한이 기본 정보/인사이트 범위를 넘으면 승인하지 않고 확인한다. 기존 토큰 값을 콘솔에서 재조회할 수 있는지와 새 토큰 발급 가능 여부는 별개다. 만료/취소된 토큰은 재인증 또는 운영자가 안전하게 교체한다. 현재 구현은 사용자 자격 증명을 보관하거나 무단 재발급하지 않는다.

`INSTAGRAM_CACHE_DIR`는 쓰기 가능한 절대 경로다. 로컬 기본값은 소스 변경 감시에서 벗어난 `/tmp/neki-admin-instagram`이다. 이 경로는 서버 프로세스 재시작 후에도 남지만 OS의 임시 파일 정리 대상이므로, 장기 보관에는 소스 트리 바깥의 영속 경로를 직접 지정한다. 운영에서 미설정이면 `AMPLITUDE_CACHE_DIR`의 `instagram` 하위 경로를 사용한다. Amplitude 경로도 미설정이면 `/app/.data/amplitude/instagram`을 사용한다. `.env.local.example`의 운영 경로를 로컬에 복사했다면 비우거나 로컬의 소스 바깥 쓰기 가능한 절대 경로로 바꾼다.

키를 주입하는 시점은 이미지 빌드가 아니라 서버 실행 시점이다. 운영에서는 동일 환경변수를 Kubernetes Secret/실행 환경에 넣고 모든 인스턴스를 재시작한다.

## 데이터 경로

`InstagramMetricsScreen → useInstagramMetrics → authenticatedFetch → /api/instagram/metrics → 관리자 인증 → Meta Graph API → 정규화 → 화면`

관리자 인증 단계는 `ADMIN_AUTH_ENABLED=true`일 때만 실행한다. 현재 사용자 요청으로 로컬·운영 모두 기본 비활성 상태이며, Meta 조회 토큰과는 별도 설정이다. 이 상태에서는 로그인 없이 지표 API에 접근할 수 있다. [인증 운영 문서](google-admin-login.md)를 따른다.

- Meta 호스트는 `https://graph.instagram.com`으로 고정한다. 토큰은 서버의 Authorization Bearer 헤더에만 넣는다.
- 서버가 설정된 계정 ID로 프로필을 조회하고 `id`(앱 범위 ID) 또는 `user_id`(콘솔의 Instagram 계정 ID)와 username을 함께 대조한 후 지표를 조회한다. 다른 계정이면 실패한다.
- 클라이언트는 날짜와 불투명 커서만 전달한다. 계정 ID·토큰·호스트를 클라이언트에서 선택할 수 없다.
- 테스트만 `INSTAGRAM_API_BASE_URL=http://127.0.0.1:<port>`의 fixture 서버를 사용한다. 임의 원격 호스트/redirect는 허용하지 않는다.
- 관리자 로그인과 Meta 인증은 별개다. Meta 토큰 오류는 502로 반환하여 운영자 Google 로그인 세션을 잘못 종료시키지 않는다.

### 코드 위치

| 파일 | 역할 |
| --- | --- |
| `app/admin/features/instagram/ui/InstagramMetricsScreen.tsx` | 기간·카드·그래프·게시물·수집 상태 표시 |
| `app/admin/features/instagram/model/useInstagramMetrics.ts` | URL 날짜, 조회/새로고침/더 보기, 취소·경쟁·쿨다운 |
| `app/admin/features/instagram/api/instagram-api.ts` | 브라우저 → 내부 API 요청 |
| `app/api/instagram/metrics/route.ts` | 인증 guard, 쿼리 검증 진입, HTTP 응답 |
| `app/api/instagram/instagram-metrics-server.ts` | 계정 검증, Meta 조회 조합, 정규화, 저장 결과 재사용 |
| `app/api/instagram/instagram-client.ts` | Bearer 요청, 메모리 캐시, 동시 호출 제한, 오류 정제 |
| `app/api/instagram/instagram-file-cache.ts` | JSON 검증·읽기·원자적 저장·만료 판단 |
| `app/admin/types.ts` | `InstagramMetricsSnapshot`, `InstagramPostMetric` 계약 |
| `tests/instagram-route.test.mjs` | API·캐시·갱신·저장 실패 회귀 테스트 |

### 내부 API

```http
GET /api/instagram/metrics?startDate=2026-09-20&endDate=2026-10-19
GET /api/instagram/metrics?startDate=2026-09-20&endDate=2026-10-19&cursor=<after>
GET /api/instagram/metrics?startDate=2026-09-20&endDate=2026-10-19&refresh=1
```

`startDate/endDate`는 합계·그래프 기간이며 기본 최근 30일, 선택 가능 범위는 최근 90일이다. `cursor`는 서버가 반환한 `nextCursor`만 사용한다. `refresh=1`은 사용자가 누르는 새로고침이며 신규 게시물과 누적 지표를 재조회하되 아래 최소 간격을 지킨다.

응답에는 `source`, `username`, `startDate`, `endDate`, `fetchedAt`, `followers/reach/likes/views`, `trend`, `posts`, `nextCursor`, `warnings`, `storage`가 있다. `storage.readFrom`은 `meta` 또는 `file`, `storage.savedAt`은 저장 시각 또는 저장되지 않은 경우 `null`이다. 수집 시각과 저장 시각은 구분하며 캐시를 읽었다고 수집 시각을 현재로 바꾸지 않는다.

### Meta API 요청

모두 `https://graph.instagram.com/v26.0` 아래의 GET이며 `Authorization: Bearer <서버 토큰>`을 사용한다.

| 경로 | 파라미터·용도 |
| --- | --- |
| `/{accountId}` | `fields=id,user_id,username,followers_count` · 연결 계정 검증·현재 팔로워 |
| `/{accountId}/insights` | `metric=reach,views,likes`, `metric_type=total_value`, `period=day`, `since/until` · 기간 합계 |
| `/{accountId}/insights` | `metric=reach`, `metric_type=time_series`, `period=day`, `since/until` · 일별 도달 |
| `/{accountId}/media` | `fields=id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp`, `limit=12`, 선택적 `after` · 전체 계정 게시물 페이지 |
| `/{mediaId}/insights` | `metric=views,comments,shares,saved,reach,profile_visits` · 게시물 누적 성과. 릴스는 `profile_visits` 제외 |

## 지표 정의

| 화면 | Meta 원본 | 범위 |
| --- | --- | --- |
| 팔로워 수 | 사용자 `followers_count` | 현재 값. 선택 기간 종료 시점의 역사적 팔로워 수가 아님 |
| 도달수 | 사용자 insights `reach`, `total_value` | 선택 기간 고유 계정. 일별 도달수나 게시물 도달수를 더하지 않음 |
| 총 좋아요수 | 사용자 insights `likes`, `total_value` | 선택 기간 Meta 집계 |
| 총 조회수 | 사용자 insights `views`, `total_value` | 선택 기간 Meta 집계. 폐기된 impressions/plays로 대체하지 않음 |
| 일별 도달 | 사용자 insights `reach`, `time_series` | Meta가 반환한 일별 값. 제공되지 않은 날을 0으로 채우지 않음 |
| 게시물 조회·댓글·공유·저장·도달 | 미디어 insights `views,comments,shares,saved,reach` | 계정의 전체 콘텐츠를 페이지별로 조회한 lifetime 누적 성과. 기간 중 발생분이 아님 |
| 프로필 방문 | 미디어 insights `profile_visits` | FEED 지원. REELS는 미제공 처리 |

기존 목 화면의 임의 `contentVisits`와 가짜 전기 대비 증감은 제거했다. 조회수의 `time_series`를 지원한다고 가정하거나 날짜마다 조회 요청을 반복하지 않는다. 따라서 일별 그래프는 도달만 표시한다. 게시물 일반 상호작용과 광고/교차 게시 포함 지표는 동일하지 않으므로 합계 카드와 게시물 합산이 같다고 가정하지 않는다.

값 미제공은 `null`/`—`, 실제 0은 `0`으로 구분한다. 빈 목록·부분 실패·인증 오류·요청 한도는 별도 상태다. 어떤 실패도 목 데이터로 fallback하지 않는다.

### 게시물이 3개만 보였던 이유와 변경

이전 구현은 `/media` 응답을 다시 `publishedAt ∈ 선택 기간`으로 걸렀다. 2026-09-20~10-19에는 게시물 3개만 남았고, 이것은 계정 전체 게시물 수가 아니었다. 현재는 이 날짜 필터를 제거했다. 오래된 게시물도 표시하며, 다음 커서가 있으면 `이전 게시물 더 보기`로 12개씩 추가 조회한다. 합계·그래프의 기간을 바꾸어도 게시물의 누적 성과 정의는 변하지 않는다. 개수에 `+`가 있으면 아직 읽지 않은 다음 페이지가 있다는 뜻이다.

기간은 최근 90일 내 날짜 범위이며 양 끝 날짜를 포함한다. 요청 경계는 서울 시간 00:00:00~23:59:59의 UNIX 초다. Meta 일별 값은 원본 `end_time`을 함께 보존하며, 그래프 툴팁에서 서울 시간 집계 종료 시각을 확인할 수 있다. 임의의 일별 조회수나 팔로워 역산을 만들지 않는다. Meta 집계 지연(최대 48시간)이 있으므로 과거 날짜를 불변값으로 확정하지 않는다. API가 특정 계정/기간을 거절하면 부분 실패를 표시하며 요청을 잘게 쪼개 자동 재시도하지 않는다.

## 요청 비용과 저장

- 첫 페이지: 프로필 1회, 기간 합계 1회, 일별 도달 1회, 미디어 목록 1회 + 해당 페이지 게시물당 insights 1회(최대 12회). 최대 16회이며 실제 게시물이 적으면 줄어든다. 뒤 페이지를 끝까지 자동 순회하지 않는다.
- 이전 게시물은 명시적인 더 보기로 12개씩 조회한다. 아직 읽지 않은 다음 페이지가 있으면 버튼을 유지하며 전체를 조회했다고 표시하지 않는다.
- 날짜 변경 시 프로필·기존 미디어 요청은 같은 캐시를 재사용한다. 정렬은 읽은 행 안에서만 수행한다.
- 동일 URL은 5분 메모리 캐시와 진행 중 Promise를 공유한다. 수집 시각은 실제 캐시 생성 시각을 유지한다.
- 같은 계정·기간·커서의 정상 정규화 결과를 JSON에 저장하고, 5분 이내에는 프로세스 재시작 뒤에도 파일에서 읽는다. 유효한 저장 응답을 읽으면 Meta API 호출은 0회다. 계정·버전·토큰·호스트·기간·커서에 대한 해시가 저장 키를 분리하므로 계정/토큰 변경 시 이전 데이터를 다른 연결에 섞지 않는다.
- 수동 새로고침은 최근 수집 후 1분까지 저장값을 재사용하고, 그 이후에는 5분 TTL이 남아 있어도 Meta를 재조회한다. Graph 메모리 캐시도 동일 URL의 최소 1분 간격을 지킨다. 신규 게시물 목록과 기존 게시물 성과를 함께 갱신한다. 성공 시 같은 JSON을 교체하고, 더 보기로 합친 화면 목록은 첫 페이지부터 다시 시작한다.
- 동시에 Meta 요청 최대 2개. 개별 요청 제한 15초, 응답 제한 2MB, 자동 네트워크 재시도 없음. 클라이언트는 취소·120초 타임아웃·요청 순서 검사를 사용한다.
- 429 및 Meta 요청 한도 오류는 해당 계정/토큰 전체를 최소 15분 대기한다. 더 긴 Retry-After를 우선한다. 다른 날짜로 바꿔도 대기를 우회하지 않는다. 일반 오류는 30초 음수 캐시다.
- JSON은 같은 볼륨의 여러 프로세스에서 공유하지만, 진행 중 요청 병합·Graph 메모리 캐시·요청 동시성·429 대기는 프로세스별이다. 서로 다른 파드에서 동시에 캐시 미스가 나면 중복 조회할 수 있다. 분산 락·분산 요청 제한은 아직 없다.
- 썸네일은 공식 응답의 HTTPS Instagram/Facebook CDN 주소만 표시한다. URL 만료 시 대체 이미지를 보이며 원본 파일을 영구 보관하지 않는다.

### JSON 구조와 재사용 규칙

```text
<INSTAGRAM_CACHE_DIR>/
└── snapshots/
    └── <요청 키 SHA-256>.json
```

```json
{
  "schemaVersion": 1,
  "keyHash": "<요청 키 SHA-256>",
  "storedAt": "2026-10-19T13:00:00.000Z",
  "expiresAt": 1792415100000,
  "value": {
    "source": "instagram",
    "username": "neki_official_",
    "startDate": "2026-09-20",
    "endDate": "2026-10-19",
    "fetchedAt": "2026-10-19T13:00:00.000Z",
    "followers": 43,
    "reach": 2022,
    "likes": 50,
    "views": 1315,
    "trend": [],
    "posts": [],
    "nextCursor": null,
    "warnings": []
  }
}
```

구조 설명용 예시이며 `trend/posts`를 비워 축약했다. 실제 파일에는 반환된 일별 값과 해당 게시물 페이지가 들어간다.

- 폴더 `700`, 파일 `600`으로 생성한다. 임시 파일에 쓰고 같은 폴더에서 rename하여 읽는 중 반쪽짜리 JSON이 노출되지 않게 한다.
- 원본 Graph 응답은 저장하지 않는다. 특히 토큰이 포함될 수 있는 `paging.next` URL은 보관하지 않고 검증한 커서만 남긴다. 토큰 자체가 정규화 결과에 포함되면 쓰지 않는다.
- 읽을 때 버전·키·만료·지표 숫자·배열 크기·URL·필드 목록을 검증한다. 손상/만료/알 수 없는 필드가 있는 파일은 사용하지 않고 다시 조회한다.
- 부분 실패한 결과는 저장하지 않는다. 저장 실패는 `warnings`와 `storage.savedAt=null`로 드러내고, UI에서 경고한다. 정상 조회 수치를 저장 성공으로 오인시키지 않는다.
- 갱신 실패 시 기존 파일은 덮어쓰지 않는다. 만료 파일을 몰래 정상 최신값처럼 반환하거나 목 데이터로 대체하지 않는다. 같은 기간의 이전 화면 값이 남으면 원래 수집 시각과 오류를 함께 표시한다.
- TTL은 파일의 최근 읽기/쓰기 시각이 아니라 실제 수집 시각에 근거한다. 캐시 재저장으로 5분 유효기간을 계속 늘리지 않는다.
- Amplitude와 저장 매체는 같지만 일별 영구 확정 정책은 복사하지 않았다. Instagram 집계는 지연·수정될 수 있고 게시물 lifetime 성과는 과거 글도 계속 증가한다. 일별 reach를 더해 기간 고유 도달을 만들지 않는다.
- 이것은 조회 스냅샷 캐시다. 과거 팔로워 추이, 매일 고정 시각의 이력 원장, 정기 백필, 파일 정리/보존 정책은 아직 구현하지 않았다. 만료는 재사용 중단이지 파일 자동 삭제가 아니다.

### 운영 반영

1. 운영 Secret에 Instagram 네 항목과 필요한 경우 `INSTAGRAM_CACHE_DIR`를 설정한다. 관리자 Google 로그인 설정과는 별개다.
2. 저장 경로를 기존 Amplitude PVC 안에 두거나 쓰기 가능한 별도 영속 볼륨을 마운트한다. 실제 마운트·용량·컨테이너 UID 1001의 쓰기 권한을 확인한다. 임시 컨테이너 디스크만 쓰면 재배포 시 파일이 사라진다.
3. 새 이미지 배포·서버 재시작 후 `/?view=instagram`과 내부 API의 계정·기간·`storage.savedAt`을 확인한다.
4. 같은 기간을 다시 요청해 `storage.readFrom=file`과 동일 `fetchedAt`을 확인한다. 프로세스 재시작 후에도 5분 이내라면 같은 저장 결과가 나와야 한다.
5. 1분 이후 새로고침으로 신규 게시물이 반영되는지 확인한다. 토큰은 서버에만 남아야 하며 다운로드 가능한 정적 경로에 캐시를 두지 않는다.

### 로컬 개발 중 반복 새로고침 방지

초기 개발용 기본 경로를 `process.cwd()/.data/instagram`으로 두었을 때 Turbopack이 동적 파일 경로를 소스 추적에 포함해 `Compiled → 페이지 GET → 지표 GET`이 반복됐다. `.gitignore`는 Git 추적 규칙이지 개발 번들러 감시 제외 규칙이 아니므로 해결되지 않았다.

개발 기본 경로를 소스 밖 `/tmp/neki-admin-instagram`으로 변경했다. 변경 후 별도 개발 서버에서 100초 이상 추가 재컴파일 0회, 최초 페이지 요청 이후 자동 페이지 요청 0회를 확인했다. 운영은 HMR이 없는 standalone 서버이며 기존 PVC 경로를 계속 사용한다. 런타임 데이터를 Docker 빌드 컨텍스트에 넣지 않도록 `.dockerignore`에도 `.data`를 제외했다. 로컬에서 `INSTAGRAM_CACHE_DIR`를 지정할 때도 프로젝트 내부 경로를 피한다.

사용자 확인용 로컬 미리보기는 빌드 산출물·정적 파일의 별도 복사본으로 실행하여, 작업 디렉터리에서 재검증 빌드를 돌려도 열린 페이지가 깨지지 않게 했다. 관련 개발 서버 동작은 [Next.js Turbopack 문서](https://nextjs.org/docs/app/api-reference/turbopack)를 참고한다. 원인 판정은 이 프로젝트의 실제 반복 요청 로그와 경로 변경 전후 비교에 근거한다.

## 검증과 운영 확인

2026-10-19 기존 앱에서 기본 정보·인사이트 권한만 동의한 토큰을 발급했다. 댓글·메시지·콘텐츠 게시 권한은 모두 해제했다. 토큰은 Git에서 제외된 로컬 `.env.local`에 저장했고 파일 권한은 `600`으로 설정했다. 운영 Secret에는 아직 반영하지 않았다. 토큰 만료 시각은 이번 검증에서 확인하지 않았으며 자동 갱신 기능도 없다.

아래는 게시물 날짜 필터를 제거하기 **전**의 실제 Meta API 및 인증된 로컬 API 검증값이다. 지표 숫자는 현재와 달라질 수 있고, 게시물 열의 3/6은 당시 기간 필터 결과이지 계정 전체 수가 아니다.

| 기간 (서울 날짜) | 팔로워 (현재) | 기간 도달 | 기간 좋아요 | 기간 조회 | 일별 도달 지점 | 기간 내 게시물 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 2026-09-20 ~ 2026-10-19 | 43 | 2,022 | 50 | 1,315 | 30 | 3 |
| 2026-07-22 ~ 2026-10-19 | 43 | 35,488 | 268 | 48,943 | 90 | 6 |

두 기간 모두 HTTP 200, `warnings: []`였고 게시물별 조회·댓글·공유·저장·도달·프로필 방문도 반환됐다. 7일 기간도 Meta의 합계·일별 API가 HTTP 200을 반환했다. 합계 지표는 서로 다른 정의이므로 도달과 조회의 대소 관계나 게시물 합산만으로 값을 교정하지 않는다. 로컬 관리자 세션은 테스트 전용 자격으로 격리했으며 Meta 응답은 fixture가 아닌 실데이터다.

프로필의 실제 `id`는 앱 범위 ID, `user_id`는 콘솔 계정 ID로 서로 달랐다. 두 식별자를 구분하도록 서버 검증 및 회귀 테스트를 수정했다. `me/permissions`는 이 Instagram Login API에서 지원되지 않아 권한 확정 근거로 사용하지 않는다. 권한 범위는 실제 동의 화면에서 확인했다.

### 전체 게시물·저장 변경 후 검증 (2026-10-19)

- 최근 30일 합계는 팔로워 43, 도달 2,022, 좋아요 50, 조회 1,316으로 실제 응답했다. 기존 검증 이후 조회수가 변한 것은 새 수집값이며 하드코딩하지 않았다.
- 게시물은 **9개**, 마지막 커서 없음으로 반환됐다. 2026-02-28의 오래된 게시물 3개도 조회·댓글·공유·저장·도달·프로필 방문과 함께 포함됐다. 기간에 해당하는 3개만 남기던 필터가 제거된 것을 확인했다.
- 초기 로컬 `.data/instagram/snapshots/`에 게시물 9개와 기간 지표를 담은 JSON이 생성됐다. 정상 HTTP 200, `warnings: []`, `storage.savedAt` 값을 확인했다. 이후 개발 감시 충돌을 수정하면서 기본 저장 위치는 `/tmp/neki-admin-instagram/snapshots/`로 분리했다. 기존 파일은 삭제하지 않았다.
- 즉시 새로고침은 저장 파일을 재사용했다. 동일 디렉터리를 사용하는 **별도 서버 프로세스**에서도 `readFrom=file`, 원래 `fetchedAt`, 게시물 9개를 반환했다.
- 파일 권한 `600`, 토큰 및 `access_token` 포함 URL이 저장 파일에 없는 것을 검사했다.
- `npm run check`: 타입 검사·ESLint·프로덕션 빌드·45개 테스트 통과. Ant Design lint와 Premium strict 정적 감사도 오류/경고 0이다.
- 인앱 브라우저에서 로그인 없이 실제 게시물 9개·오래된 글·수동 새로고침·로컬 정렬을 확인했다. 폭 616px에서 문서 가로 넘침 없이 표/그래프가 내부 스크롤로 유지되고, 콘솔 오류/경고가 없었다. 사용자 미리보기를 분리한 뒤 작업 트리에서 전체 빌드를 재실행해도 화면이 유지됐다.
- 신규 게시물 감지 회귀 테스트는 fixture에 새 글을 추가한 뒤 1분 경과한 저장값으로 재조회하여 4→5개 변경과 저장을 검증한다. 실제 NEKI 계정에 테스트 글을 게시하지는 않았다.
- 운영 배포·운영 Secret/PVC 실제 설정은 아직 수행하지 않았다.

```bash
npm run check
antd lint app/admin/features/instagram --format json
```

`tests/instagram-route.test.mjs`는 실제 토큰 대신 로컬 Graph fixture로 인증, 날짜 검증, 기간 합계/일별/누적 구분, null/0, 토큰 비노출, 캐시/동시 요청, 커서, 부분 실패, 토큰 만료, 권한 오류, 계정 불일치, 429 대기를 검증한다. 이 테스트가 NEKI 실데이터 연동 성공을 의미하지 않는다.

실제 운영 확인은 토큰 설정 후 `/api/instagram/metrics?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` 응답의 계정·숫자·warnings를 Meta 인사이트와 같은 기간/정의로 대조한다. 관리자 인증을 활성화했다면 로그인도 필요하다. 재조회 때 호출이 늘지 않는지 확인하고 실패 시 원본 오류/토큰을 UI에 노출하지 않는다. 운영 Secret 반영·재시작·배포는 별도로 수행한다.

## 공식 근거

- [사용자 인사이트](https://developers.facebook.com/documentation/instagram-platform/api-reference/instagram-user/insights): 2026-10-19 로그인 브라우저로 확인. 기본/인사이트 권한, v26.0, 지표 유형, 미제공값·지연·end_time.
- [미디어 인사이트](https://developers.facebook.com/documentation/instagram-platform/reference/instagram-media/insights): 같은 날 확인. 미디어 유형별 지원 지표, lifetime, 일반 상호작용과 광고 포함 지표 구분.
