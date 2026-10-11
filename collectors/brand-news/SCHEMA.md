# 정규화 산출물 계약 v1

이 계약은 독립 수집기의 파일 형식이다. 관리자/백엔드 API 스펙이나 서버 enum을 확정하는 문서가 아니다. API 연결 시 별도 adapter에서 변환한다.

## 단위와 식별자

- 한 레코드는 공식 출처의 원문 게시물 1건이다. 글 안의 여러 프레임을 별개 상품으로 쪼개지 않는다.
- 키는 `<brandId>:<sourceKey>:<externalId>`다. 같은 콜라보라도 출처가 다르면 별도 행이다.
- 같은 ID의 정규화 값이 같으면 최신 관측 행으로 병합한다. 내용이 상충하면 모두 격리하며 임의로 하나를 선택하지 않는다.
- 정규화 버전, 데이터 기준일, 생성 시각을 파일 최상단에 기록한다.
- Instagram은 영숫자 shortcode가 `externalId`이며 등록 계정의 `/p/<shortcode>/`, `/reel/<shortcode>/` 경로만 허용한다. 인생네컷의 현재 출처는 `lifefourcuts-instagram` / `life4cuts_official`이다. 이전 `lifefourcuts-frames` 갤러리 기록은 숫자 `gal_item` ID와 `#caption_<ID>` 위치 링크 계약으로 보존하되 현재 산출물에서 제외한다.
- SNS 제목은 공개 캡션의 첫 유효 줄이다. 게시일은 상세 `og:description`의 작성자 다음 날짜에서 추출한다. 이미지 CDN 경로 날짜를 게시일로 쓰지 않는다. 기간·지역은 이미지 OCR이나 추측으로 채우지 않는다.

## `normalized.json` / `frame-events.json`

| 필드 | 의미 | 정규화 규칙 |
| --- | --- | --- |
| `schemaVersion` | 파일 계약 버전 | 현재 1 |
| `generatedAt` | 산출물 생성 시각 | UTC ISO 8601 |
| `asOfDay` | 날짜 비교 기준일 | 생성 시각의 Asia/Seoul 날짜 |
| `grain` | 행 단위 | `one-official-source-post` |
| `records[].id` | 원문 식별 키 | 필수, source/brand/external ID와 일치해야 함 |
| `brand.id`, `brand.name` | 조사 등록부의 브랜드 | 입력 문자열이 아닌 검증된 등록부 기준 |
| `title` | 원문 제목 | NFC, 공백 통일, 숨은 폭 0 문자 제거 |
| `classification.primary` | 대표 분류 | `collaboration`, `frame`, `event`, `partnership`, `news` |
| `classification.tags` | 제목·원문 카테고리 태그 | 복수 가능, 분류 확정값이 아닌 검토 힌트 |
| `classification.bodyHints` | 요약 본문의 키워드 | 제목 근거와 구분. 이 값만으로 프레임 후보 확정 안 함 |
| `classification.basis`, `evidenceText` | 분류 근거 | 원문 카테고리/제목 키워드, 실제 제목 |
| `relevance` | 산출물 구분 | `frame-event`, `possible-related-news`, `partnership`, `general-news` |
| `publishedOn` | 원문 발행일 | 유효한 `YYYY-MM-DD` 또는 null, 관측일로 대체하지 않음 |
| `period.startsOn`, `endsOn` | 원문에 기재된 촬영/행사 기간 | 날짜 유효성 검사, 역전이면 둘 다 null과 경고 |
| `period.rawText` | 원문 기간 문자열 | 연도 보정의 근거 보존 |
| `period.yearBasis` | 연도의 근거 | `explicit-source-year`, `publication-year`, `unknown` |
| `scope.type` | 부스 적용 범위 | 현재 `unverified`, 제목의 부스명만으로 전국 적용 추정 금지 |
| `media.imageUrl` | 원문 이미지 링크 | HTTPS만 허용. 이미지 파일은 저장하지 않음 |
| `media.imageUrls` | 원문 순서의 사진 목록 | 대표 사진 포함, 중복 제거, HTTPS·인증정보 없는 URL만 최대 20장. 목록 미확보는 빈 배열 |
| `content.excerpt` | 원문 목록/RSS 요약 | 텍스트로 정규화, 목록 파서에서 최대 2,000자 |
| `source.key`, `externalId`, `url` | 원문 출처 | 등록된 원문 경로/ID/공식 계정만 허용, 추적 파라미터 제거 |
| `source.fingerprint` | 원문 후보 내용 해시 | 수집 단계의 SHA-256, 원문 HTML 전체의 해시 아님 |
| `source.observedAt` | 실제 후보 관측 시각 | UTC ISO 8601, 캐시 재처리 시 바꾸지 않음 |
| `status.review` | 검토 상태 | `pending`, `approved`, `rejected`; 수정 감지 시 pending |
| `status.reportedEnded` | 원문에서 명시된 종료 | 제목의 종료 표기 근거, 기간 추정과 별개 |
| `status.availability` | 실제 촬영 가능 여부 | 현재 전부 `unverified` |
| `status.calendarHint` | 기간과 기준일 비교 | `past-listed-period`, `future-listed-period`, `within-listed-period`, `unknown` |
| `quality.warnings` | 결측·오류·검토 항목 | 중복 제거하고 정렬한 경고 코드 목록 |

`calendarHint=within-listed-period`라도 촬영 가능을 뜻하지 않는다. 같은 글의 부스 한정, 조기 종료, 날짜 이미지, 지역 범위는 사람이 원문을 확인해야 한다.

원문 상태의 `fingerprintVersion=2`는 Instagram CDN 쿼리·서명을 제외하고 이미지 경로로 변경을 판정한다. 여러 장의 사진을 확보하면 사진 목록도 내용 해시에 포함한다. 기존 상태를 처음 갱신할 때 저장된 내용으로 같은 규칙의 해시를 계산해 비교하므로 해시 규칙 변경만으로 재검토하지 않는다. 정규화 파일 형식 버전은 여전히 1이다.

포토시그니처는 상세 `.view_image img`, 하루필름은 상세 `.board_txt_area img`만 읽고 사이트 로고·댓글 사진은 제외한다. Instagram은 정확히 같은 shortcode의 공개 JSON에 포함된 carousel만 허용하며 다른 글·프로필 사진을 모으지 않는다. carousel이 공개되지 않으면 확인된 대표 사진만 저장한다. 사진 목록 미확보를 원문의 단일 사진 확정으로 취급하지 않는다. `mediaObservedAt`은 웹 상세 사진 목록의 마지막 정상 조회 시각이다. 어드민 조회 JSON은 `imageUrls`와 `excerpt`를 평탄화해 제공하며 구버전 JSON은 해당 필드가 없어도 읽을 수 있다.

출처 진단은 `ok`, `cached`, `error`, `partial`, `deferred`를 구분한다. `lastSuccessAt`은 전체 성공만 갱신한다. `partial`에는 읽은 글 수·선택 수·상세 실패 수와 `lastPartialAt`을 남긴다. `failureCode`, `consecutiveFailures`, `lastAttemptAt`, `nextAttemptAt`으로 원인·실패 누적·재시도 대기를 다음 실행에도 유지한다. 옛 `ok` 진단에 상세 실패 수가 있으면 전체 성공으로 표시하지 않는다.

## 검증과 격리

필수 원문 ID·제목·등록 브랜드·등록 출처·원문 URL·내용 해시가 잘못되면 `quarantine.json`에 ID/제목/출처 키/사유를 남긴다. URL은 HTTPS이며 인증정보가 없어야 하고, 원문 경로·글 ID·공식 블로그 계정이 등록 정보와 일치해야 한다. 다른 사이트 링크를 대신 따라가지 않는다.

선택 날짜 오류나 위험한 이미지 URL은 해당 값만 null로 만들고 경고를 남긴다. `quality.json`의 품질 게이트는 격리 건수나 잘못된 선택 값이 있으면 실패한다. 단순 기간 미확인/게시일 누락은 후보 수집의 알려진 제약으로 보고서에 표시한다.

`frame-events.json`은 제목 또는 원문 카테고리에 프레임·콜라보·이벤트 근거가 있는 행만 포함한다. 제휴 및 본문 키워드만 있는 가능 소식은 `normalized.json`과 검토 대기 목록에서 확인한다. 승인된 데이터셋이나 현재 판매 목록이 아니다.

## 실행과 증거 파일

- `source-records.json`: 정규화 전 누적 후보 스냅샷. HTML 원문 아카이브가 아니다.
- `run.json`: 실제 수집/캐시/오프라인 모드, 출처별 상태, 이번 신규·수정 ID. 오프라인의 신규·수정은 null이며 API 호출은 없다.
- `quality.json`: 전체 및 브랜드별 건수, 누락 비율, 중복·격리·유효성 검사, 미래 발행일 후보.
- `coverage.json`: 현재 선택한 6개 브랜드의 수집원 상태. 수집원 미확보를 "소식 없음"으로 취급하지 않는다.
- `review-queue.json`: 검토 대기 ID·제목·분류·원문 URL·경고. 전체 내용은 같은 ID의 정규화 행에서 확인한다.
- `manifest.json`: 나머지 10개 파일의 바이트 수·SHA-256. manifest 자신의 해시는 자기참조라 넣지 않는다.
- `REPORT.md`: 위 결과에서 자동 생성한 한국어 수집/정규화 실행 보고서.
- `REPORT.html`: 수집 항목 이미지·메타데이터·원문 링크·브랜드별 전체 목록을 표시하는 독립 HTML. 이미지는 외부 원문 URL로 읽으며 파일로 복제하지 않는다.

정규화·보고는 로컬에 이미 저장된 누적 후보로 다시 실행할 수 있다. 실행마다 별도 시각/랜덤 ID 폴더에 저장하며, 완료된 산출물 폴더를 덮어쓰지 않는다. 파일 작성이 끝난 staging 폴더를 원자적 rename으로 공개한다. 쓰기 실패 시 완성 폴더는 생성되지 않고 진단용 staging이 남을 수 있다.
