# 브랜드 소식 수집·어드민 연결

## 데이터 경로

```text
GitHub Actions (6시간 간격, 익명 Chrome / 공개 HTML)
  → 게시물 ID 비교·실패 큐·정규화 검증
  → data/brand-news 브랜치
      state.json       다음 실행이 복원할 누적 상태·쿨다운
      brand-news.json  어드민용 공개 조회 계약
  → Next.js GET /api/brand-news (5분 캐시·동시 요청 병합)
  → ?view=brand-news (소식 목록 / 수집 상태)
```

웹 서버는 수집기나 Chrome을 실행하지 않는다. 화면의 새로고침은 공유 JSON을 다시 조회하며 Instagram 요청을 만들지 않는다. 별도 DB·수집 백엔드·SNS 키는 필요 없다. 브라우저 localStorage가 아니라 같은 데이터 브랜치를 읽으므로 여러 사용자에게 같은 저장본이 제공된다. 여러 웹 파드의 5분 캐시 만료 시점에는 잠깐 차이가 있을 수 있다.

현재 대상은 포토이즘·포토그레이·인생네컷·포토시그니처·하루필름·돈룩업이다. Amplitude 지표와는 별도의 기능 탭이며 기존 지표 수집 경로는 변경하지 않는다.

## PR 머지 후 활성화

1. 기본 브랜치 `main`으로 PR을 머지한다. 기존 `build` 워크플로가 이미지와 GitOps 태그를 갱신하므로 웹 기능은 기존 운영 배포 경로를 따른다. 이 PR 작성만으로 운영 배포되지는 않는다.
2. Actions에서 `collect-brand-news`를 `main` 대상으로 한 번 수동 실행한다. 이후 UTC `17 */6 * * *`, 한국 시간 03:17·09:17·15:17·21:17에 실행을 시도한다. 별도의 Codex 자동화는 중복 생성하지 않는다.
3. 첫 실행은 `collectors/brand-news/bootstrap/state.json`의 실제 수집 196건(관측 2026-10-10)을 복원하고 새 결과를 합친다. 이후에는 데이터 브랜치의 상태만 복원한다. 초기본도 포토그레이 부분 실패 상태를 유지한다. 미수집 값을 목 데이터로 채우지 않는다.
4. 워크플로의 `GITHUB_TOKEN`에 `contents: write`가 허용되어야 한다. 새 PAT/사용자 Secret은 필요 없다. 조직 정책이 쓰기나 `data/brand-news` 생성을 차단하면 실패하며 보호 규칙을 우회하지 않는다.
5. `/api/brand-news`의 200 응답과 `?view=brand-news`를 확인한다. 운영에 `BRAND_NEWS_DATA_FILE`을 지정하지 않는다. 기본 공유 URL은 `https://raw.githubusercontent.com/Team-Neki/Team-Neki-Admin/data/brand-news/brand-news.json`이다. 첫 게시 전 API는 명시적인 503 오류를 반환한다.

GitHub 예약 실행은 정확한 시각을 보장하지 않는다. 부하로 지연/누락될 수 있고 공개 저장소가 60일간 비활성 상태이면 예약 실행이 꺼질 수 있으므로 Actions 상태와 최근 성공 시각을 확인한다. 데이터 봇 커밋이 이를 반드시 방지한다고 가정하지 않는다. [GitHub 공식 schedule 제약](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

## 영속성과 장애 처리

- 작업을 `brand-news-data` concurrency 그룹으로 직렬화한다. 데이터 브랜치는 앱 소스 없이 JSON 두 파일만 가진다. 일반 Git 파일 잠금은 runner 내에서만 유효하다.
- Git Data API로 새 데이터 커밋을 만들고 `force: false`로 참조를 갱신한다. 다른 쓰기가 먼저 진행되어 충돌하면 실패하고 덮어쓰지 않는다. 앱 빌드 트리거는 `main`이므로 데이터 업데이트마다 재배포하지 않는다.
- 부분 실패도 정상 게시물과 재시도 상태를 먼저 저장하고 작업을 실패 처리한다. 이전 정상 게시물은 삭제하지 않는다. 파싱 계약/저장 상태가 손상되면 게시하지 않는다. Git 커밋 이력이 백업이며 별도의 로그/세션 덤프를 업로드하지 않는다.
- Instagram document와 1차 도메인의 XHR/fetch 응답을 함께 감시한다. 429·401/403·로그인·challenge URL이 관측되면 대기 중 작업을 중단하고 추가 요청을 차단한다. 인증을 우회하지 않는다. HTTP 200 응답 본문만으로 표시되는 차단은 메타데이터 실패로 분류될 수 있다.
- 신규 ID → 기한이 된 실패 게시물 → 24시간 이상 지난 기존 게시물 순으로 최대 12개 상세를 읽는다. 정상 저장본을 매 실행 모두 재조회하지 않는다. 오래된 글 전체나 목록 밖 게시물의 변경까지 보장하지 않는다.
- 상세 실패는 `url`, `stage`, `code`, `attempts`, `lastAttemptAt`, `nextAttemptAt`, `status`를 저장한다. 1시간·2시간 후 재시도 가능하며 3회 실패하면 `needs-review`로 중단한다. 출처 전체 429 대기가 더 길면 그것을 우선한다.
- 단일 게시물 파싱 오류는 출처 전체를 장기 중단하지 않는다. 로그인/429 등의 출처 장애는 기존 지수 백오프를 적용한다. 실패 큐가 남으면 전체 성공으로 바꾸지 않는다.
- 각 실행은 15분 제한이다. 실행 도중 강제 종료되면 그 실행의 새 결과는 게시되지 않을 수 있지만 이전 데이터 커밋은 유지된다. GitHub의 실패 알림 설정을 사용하며 별도 Slack/메일 전송은 구현하지 않았다.
- 웹 API는 공유 JSON을 검증하고 5분간 캐시한다. 동시 갱신은 하나로 병합하고 초기 실패는 30초 동안 재요청하지 않는다. 이전 정상 캐시가 있으면 갱신 실패를 `stale: true`로 표시하고 30초 후 재시도한다. 저장본 자체가 24시간 이상 오래되면 화면에 경고한다.

## 수동 복구

`needs-review` 게시물은 원문 링크·실패 단계를 먼저 확인한다. 파서 보완 뒤 데이터 브랜치 `state.json`의 해당 실패 항목만 제거하고 워크플로를 실행한다. 원문이 삭제되었으면 실패 기록을 유지하거나 명시적인 운영 판단으로 제외한다. 성공 시 해당 실패 항목만 제거된다. `--force`도 출처 쿨다운이나 수동 검토 상태를 무시하지 않는다.

## 보안·권리·데이터 의미

현재 저장소와 데이터 브랜치는 **공개**다. 공개 원문의 메타데이터·최대 2,000자 캡션·공개 이미지 URL·재시도 상태만 allowlist로 저장한다. 쿠키·로그인 세션·GraphQL 토큰·응답 헤더·환경변수·임의 오류 본문·Sites 프로젝트는 게시하지 않는다. 비공개 자료를 이 경로에 넣지 않는다.

어드민의 조회 계약은 제목·날짜·분류·원문 링크·검토 상태이며 이미지 파일을 복제하지 않는다. 외부 이미지 서명 만료는 영구 저장으로 해결한 것이 아니다. 제목 기반 분류는 검토 후보이고 실제 촬영 가능 여부·부스 적용·기간을 확정하지 않는다. 공개 페이지 접근 가능성과 정기 수집/재배포 허락은 다르므로 각 출처 약관과 권리는 별도로 확인해야 한다. 익명 GitHub runner의 Instagram 차단 여부와 장기 무인 성공률은 머지 후 연속 실행으로 검증해야 한다.

## 로컬 검증

```sh
npm ci --prefix collectors/brand-news
npm test --prefix collectors/brand-news
npm run export --prefix collectors/brand-news -- --state bootstrap/state.json
BRAND_NEWS_DATA_FILE="$PWD/collectors/brand-news/data/brand-news.json" npm run dev
npm run check
```

수집 없이도 초기 저장본을 조회할 수 있다. 로컬 파일 경로는 서버 환경변수로만 받으며 브라우저 요청으로 바꿀 수 없다. 코드·화면·테스트는 PR에 포함하지만 `data/`, 브라우저 덤프, Sites 산출물은 Git과 웹 Docker 빌드에서 제외한다.
