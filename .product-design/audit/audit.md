# Neki Admin 운영 기능 감사

## Audit scope

수동 알림 발송, 발송 이력·예약 취소, 지점 목록·등록, 브랜드 지원 현황·수정 흐름을 1440 × 1000 데스크톱 화면에서 combined UX/accessibility 관점으로 확인했다.

## User goal and accessibility target

운영자가 반복 작업을 빠르게 찾고, 검색·필터로 대상을 좁히며, 발송·폐점·취소처럼 영향이 큰 작업은 결과를 이해한 뒤 실행할 수 있어야 한다. 키보드 접근, 명확한 레이블, 상태 전달과 오류 회복을 함께 점검했다.

## Captured flow

1. 알림 작성 — healthy: 필수 정보, 대상의 상호 배타 규칙, 즉시·예약 분기가 한 흐름에 모여 있다. (`01-notification-compose.png`)
2. 발송 확인·성공 — healthy: 예상 인원을 비동기로 조회한 뒤 확인하고, 성공 후 다음 행동을 선택한다. (`02-notification-confirm.png`, `03-notification-success.png`)
3. 발송 이력·예약 취소 — healthy: 검색·방식·상태 필터, 예상/실제 인원, 실패·예약·취소 상태와 영향 요약이 보인다. (`04-notification-history.png`, `05-notification-cancel-confirm.png`)
4. 지점 목록·등록 — healthy: 검색·브랜드·상태 필터와 주소 선택·위치 반영, 중복 가능성 및 등록 확인 경계를 제공한다. (`06-store-list.png`, `07-store-create.png`)
5. 브랜드 현황·수정 — healthy: 전체/부분/미지원 요약과 독립적인 QR·지도 상태 제어가 일치한다. (`08-brand-list.png`, `09-brand-edit.png`)
6. 빈 화면·오류 복구 — healthy: 신규 등록 또는 재시도라는 다음 행동이 명확하다. (`10-store-empty.png`, `11-load-error.png`)
7. 빠른 실행 — healthy: Lazyweb 근거를 반영해 마우스와 `⌘/Ctrl+K` 양쪽으로 주요 업무에 접근한다. (`12-command-palette.png`)

## Strengths

- 기존 Neki의 coral/Pretendard/둥근 카드 언어를 유지하면서 업무 밀도를 높였다.
- 파괴적 상태 변경과 외부 효과가 있는 발송은 세부 요약 모달을 거친다.
- 검색 결과 없음과 데이터 자체가 없음이 서로 다른 다음 행동으로 이어진다.
- 입력 실패 시 폼을 유지하도록 mutation 경계를 구성했다.

## UX and accessibility risks

- 실제 API에서 매우 긴 지점명·주소·오류 메시지가 들어오면 표의 말줄임과 상세 화면을 다시 확인해야 한다.
- 스크린샷으로는 실제 스크린리더 발화 순서와 모든 브라우저의 focus trap을 완전 검증할 수 없다.
- 색상 외에도 텍스트 상태를 함께 제공했지만, 운영 조직의 공식 WCAG 목표가 정해지면 자동 대비 검사를 추가해야 한다.

## Recommendations applied

- Lazyweb의 커맨드 런처 가설을 `⌘/Ctrl+K` 빠른 실행으로 적용했다.
- Deputy/Make의 위치·데이터 관리 표처럼 필터, 결과 수, 표를 한 카드 안의 명확한 층으로 구성했다.
- Calendly 확인 패턴처럼 예약 취소와 폐점에 영향 요약과 별도 최종 버튼을 제공했다.

## Evidence limits

실제 주소 검색, 푸시 제공자, 사용자 집계, Discord, 서버 페이지네이션 API는 아직 없으므로 화면 동작은 mock adapter로 검증했다. 백엔드 enum이나 임의 요청 필드명은 확정하지 않았다.
