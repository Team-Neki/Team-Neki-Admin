import type { AnalyticsEventRecord, AnalyticsEventParameter, QrParsingRule } from "./types";

const parameter = (name: string, description: string, values?: string, optional = false): AnalyticsEventParameter => ({
  name,
  description,
  ...(values ? { values } : {}),
  ...(optional ? { optional: true } : {}),
});

const event = (
  id: string,
  name: string,
  area: string,
  screen: string,
  trigger: string,
  parameters: AnalyticsEventParameter[],
  description: string,
  sourceFile: string,
): AnalyticsEventRecord => ({ id, name, area, screen, platform: "Android", trigger, parameters, description, sourceFile });

export const mockAnalyticsEvents: AnalyticsEventRecord[] = [
  event("global-app-open", "app_open", "앱 공통", "앱 진입", "기존 로그인 세션의 토큰 갱신 성공 후", [], "인증된 기존 사용자의 앱 진입을 기록합니다. 신규 로그인 완료나 모든 실행을 의미하지 않습니다.", "SplashViewModel.kt"),
  event("global-notification-click", "notification_click", "앱 공통", "푸시 알림", "푸시 알림을 눌러 앱이 알림 응답을 받았을 때", [parameter("notification_type", "알림 유형", undefined, true), parameter("message_tone", "메시지 톤", undefined, true), parameter("has_variable", "변수 포함 여부", undefined, true)], "푸시 알림을 통한 앱 진입을 기록합니다. Android는 파라미터 없이, iOS는 payload 값이 있을 때만 전송합니다.", "MainActivity.kt"),

  event("archive-view", "archiving_view", "아카이빙", "아카이빙 메인", "아카이빙 영역에 진입할 때", [], "아카이빙 영역 조회를 기록합니다. 재진입이나 화면 재생성으로 반복될 수 있습니다.", "ArchiveMainViewModel.kt"),
  event("archive-photo-upload", "photo_upload", "아카이빙", "사진 업로드", "갤러리 또는 QR 사진의 서버 등록 성공 후", [parameter("method", "사진 등록 방식", "gallery | qr"), parameter("count", "등록된 사진 수")], "사진 업로드 방식과 실제 등록 완료 수를 기록합니다.", "SelectAlbumViewModel.kt"),
  event("archive-album-create", "album_create", "아카이빙", "앨범", "앨범 생성 요청 성공 후", [], "새 앨범을 성공적으로 생성한 행동을 기록합니다.", "AllAlbumViewModel.kt"),
  event("archive-album-add-detail", "album_add_from_detail", "아카이빙", "사진 상세", "사진 상세에서 단일 사진을 앨범에 추가한 작업 성공 후", [parameter("album_count", "대상 앨범 수")], "사진 상세에서 한 장의 사진을 몇 개 앨범에 추가했는지 기록합니다.", "SelectAlbumViewModel.kt"),
  event("archive-album-add-multi", "album_add_from_multi", "아카이빙", "다중 선택", "여러 사진을 선택해 앨범에 추가한 작업 성공 후", [parameter("photo_count", "선택 사진 수"), parameter("album_count", "대상 앨범 수")], "다중 선택 상태의 앨범 추가 결과를 기록합니다. 동일 작업에서 photo_copy가 함께 발생할 수 있습니다.", "SelectAlbumViewModel.kt"),
  event("archive-photo-move", "photo_move", "아카이빙", "사진 이동", "선택한 사진의 앨범 이동 성공 후", [], "사진을 다른 앨범으로 이동한 행동을 기록합니다. Android에서만 전송됩니다.", "SelectAlbumViewModel.kt"),
  event("archive-photo-copy", "photo_copy", "아카이빙", "사진 복사", "선택한 사진의 앨범 복사 성공 후", [], "사진 복사를 기록합니다. 앨범 추가 이벤트와 중복될 수 있습니다.", "AlbumDetailViewModel.kt"),
  event("archive-photo-detail", "photo_detail_view", "아카이빙", "사진 상세", "사진 상세가 표시될 때", [], "사진 상세 조회를 기록합니다. 사진 ID는 수집하지 않습니다.", "PhotoDetailViewModel.kt"),
  event("archive-photo-memo", "photo_memo_create", "아카이빙", "사진 메모", "사진 메모 편집을 완료하고 저장 처리를 실행할 때", [], "메모 신규 작성·수정·삭제를 포함합니다. 메모 내용은 수집하지 않습니다.", "PhotoDetailViewModel.kt"),
  event("archive-photo-add-album", "photo_add_to_album", "아카이빙", "앨범 상세", "다른 위치의 사진을 현재 앨범으로 가져오기 성공 후", [parameter("photo_count", "가져온 사진 수"), parameter("album_count", "대상 앨범 수")], "특정 앨범으로 사진을 가져온 결과를 기록합니다.", "AlbumDetailViewModel.kt"),

  event("map-view", "map_view", "지도", "지도", "지도 영역에 진입할 때", [], "지도 영역 조회를 기록합니다.", "MapViewModel.kt"),
  event("map-re-search", "map_re_search", "지도", "지도 재검색", "현재 지도 영역에서 다시 검색을 요청할 때", [parameter("has_filter", "필터 적용 여부"), parameter("region_changed", "지역 변경 여부")], "지도 이동 후 재검색 요청을 기록하며 검색 성공을 의미하지 않습니다.", "MapViewModel.kt"),
  event("map-brand-filter", "map_brand_filter_toggle", "지도", "브랜드 필터", "브랜드 필터를 선택하거나 해제할 때", [parameter("action", "변경 동작", "select | deselect"), parameter("selected_count", "변경 후 선택 수"), parameter("brand_name", "브랜드명")], "어떤 브랜드 필터가 어떻게 변경됐는지 기록합니다.", "MapViewModel.kt"),
  event("map-booth-select", "booth_select", "지도", "포토부스 선택", "지도 마커 또는 하단 목록에서 포토부스를 선택할 때", [parameter("entry_point", "진입 위치", "map | bottom_sheet"), parameter("brand_name", "브랜드명")], "포토부스를 선택한 위치와 브랜드를 기록합니다. 부스 ID와 지점명은 수집하지 않습니다.", "MapViewModel.kt"),
  event("map-route-click", "map_route_click", "지도", "길찾기", "길찾기에 사용할 외부 지도 앱을 선택할 때", [parameter("map_type", "선택한 지도 앱", "kakao_map | naver_map | google_map")], "선택한 길찾기 앱을 기록합니다.", "MapViewModel.kt"),
  event("map-brand-order", "brand_order_save", "지도", "브랜드 순서", "브랜드 우선순위 저장 요청 성공 후", [parameter("priority_brand_1", "1순위 브랜드"), parameter("priority_brand_2", "2순위 브랜드"), parameter("priority_brand_3", "3순위 브랜드")], "저장한 상위 3개 브랜드 순서를 기록합니다.", "PhotoBoothOrderChangeViewModel.kt"),
  event("map-favorite-view", "favorite_booth_view", "지도", "저장한 포토부스", "저장한 포토부스 영역을 조회할 때", [parameter("favorite_booth_count", "저장된 포토부스 수")], "저장한 포토부스 목록 조회와 당시 저장 수를 기록합니다.", "MapViewModel.kt"),
  event("map-favorite-filter-on", "favorite_booth_filter_on", "지도", "저장 필터", "저장한 포토부스만 보기 필터를 켤 때", [parameter("favorite_booth_count", "저장된 포토부스 수")], "저장한 포토부스 필터 활성화를 기록합니다.", "MapViewModel.kt"),
  event("map-favorite-filter-off", "favorite_booth_filter_off", "지도", "저장 필터", "저장한 포토부스만 보기 필터를 끌 때", [], "저장한 포토부스 필터 비활성화를 기록합니다.", "MapViewModel.kt"),
  event("map-favorite-add", "booth_favorite_add", "지도", "포토부스 저장", "포토부스 즐겨찾기를 미저장에서 저장으로 바꿀 때", [parameter("booth_name", "부스명"), parameter("brand_name", "브랜드명")], "저장 목록에 추가한 포토부스를 기록합니다.", "MapViewModel.kt"),
  event("map-favorite-remove", "booth_favorite_remove", "지도", "포토부스 저장", "포토부스 즐겨찾기를 저장에서 미저장으로 바꿀 때", [parameter("booth_name", "부스명"), parameter("brand_name", "브랜드명")], "저장 목록에서 제거한 포토부스를 기록합니다.", "MapViewModel.kt"),

  event("pose-view", "pose_view", "포즈", "포즈 메인", "포즈 영역에 진입할 때", [], "포즈 영역 조회를 기록합니다.", "PoseViewModel.kt"),
  event("pose-random-start", "pose_random_start", "포즈", "랜덤 추천", "랜덤 포즈 추천 세션을 시작할 때", [], "랜덤 포즈 추천 시작을 기록합니다.", "RandomPoseViewModel.kt"),
  event("pose-random-end", "pose_random_session_end", "포즈", "랜덤 추천", "랜덤 추천을 닫거나 세션이 정리될 때", [parameter("total_swipe_count", "총 스와이프 횟수")], "랜덤 추천 세션 종료와 탐색량을 기록합니다.", "RandomPoseViewModel.kt"),
  event("pose-filter", "pose_filter_toggle", "포즈", "인원 필터", "인원 수 필터를 선택하거나 변경할 때", [parameter("people_count", "선택한 인원 수", "1 | 2 | 3 | 4")], "선택한 포즈 인원 수를 기록합니다.", "PoseViewModel.kt"),
  event("pose-bookmark-filter", "pose_bookmark_filter", "포즈", "북마크 필터", "저장한 포즈만 보기 필터를 누를 때", [], "북마크 필터 전환을 기록합니다.", "PoseViewModel.kt"),
  event("pose-bookmark", "pose_bookmark", "포즈", "포즈 목록·상세·랜덤", "포즈 북마크 상태를 변경할 때", [], "북마크 변경을 기록하며 추가·제거·포즈 ID·발생 위치는 수집하지 않습니다.", "PoseViewModel.kt"),

  event("mypage-logout", "mypage_logout", "마이페이지", "로그아웃", "로그아웃 확정 후 세션 종료 흐름이 실행될 때", [], "로그아웃 행동을 기록합니다.", "MyPageViewModel.kt"),
  event("mypage-withdraw", "mypage_withdraw", "마이페이지", "회원 탈퇴", "회원 탈퇴 요청 성공 후", [], "정상적으로 완료된 회원 탈퇴를 기록합니다.", "MyPageViewModel.kt"),
];

export const mockQrParsingRules: QrParsingRule[] = [
  { id: "android-webview-photoism", platform: "Android", brand: "포토이즘", acquisitionFlow: "WebView 진입 즉시", entryPattern: "qr.seobuk.kr/s/", extractionRule: "WebView 네트워크 요청 감시", imageRule: "photoism-cms-prd...amazonaws.com 포함 + .jpg 종료", expectedFormat: "JPG", resultType: "imageUrl String" },
  { id: "android-webview-life4cut", platform: "Android", brand: "인생네컷", acquisitionFlow: "WebView 진입 즉시", entryPattern: "api.life4cut.net/", extractionRule: "WebView 네트워크 요청 감시", imageRule: "release-renewal-s3.../QRimage 포함 + image.jpg 종료", expectedFormat: "JPG", resultType: "imageUrl String" },
  { id: "android-webview-haru", platform: "Android", brand: "하루필름", acquisitionFlow: "WebView 진입 즉시", entryPattern: "haru4.mx2.co.kr/", extractionRule: "WebView 네트워크 요청 감시", imageRule: "haru4.mx2.co.kr/download/album/ 포함 + .jpg 종료", expectedFormat: "JPG", resultType: "imageUrl String" },
  { id: "android-download-photosignature", platform: "Android", brand: "포토시그니처", variant: "구형", acquisitionFlow: "다운로드 안내 후 WebView", entryPattern: "photoqr3.kr/", extractionRule: "사용자 다운로드 동작 후 요청 감시", imageRule: "photoqr3.kr/R/ 포함 + a.jpg 종료", expectedFormat: "JPG", resultType: "imageUrl String" },
  { id: "android-download-photosignature-viewer", platform: "Android", brand: "포토시그니처", variant: "뷰어", acquisitionFlow: "다운로드 안내 후 WebView", entryPattern: "photosignature-viewer.web.app", extractionRule: "사용자 다운로드 동작 후 요청 감시", imageRule: ".../sessions/ 포함 + final.jpg 종료", expectedFormat: "JPG", resultType: "imageUrl String" },
  { id: "android-download-photogray", platform: "Android", brand: "포토그레이", acquisitionFlow: "다운로드 안내 후 WebView", entryPattern: "pgshort.aprd.io/", extractionRule: "사용자 다운로드 동작 후 요청 감시", imageRule: "pg-qr-resource.aprd.io 포함 + image.jpg 종료", expectedFormat: "JPG", resultType: "imageUrl String" },
  { id: "android-download-monomansion", platform: "Android", brand: "모노맨션", acquisitionFlow: "다운로드 안내 후 WebView", entryPattern: "qr.mono-mansion.com/", extractionRule: "사용자 다운로드 동작 후 요청 감시", imageRule: "ncloudstorage.com 포함 + COMPLETE.jpg 종료", expectedFormat: "JPG", resultType: "imageUrl String", notes: "이미지 URL matcher만 대소문자를 무시합니다." },
  { id: "ios-native-aura", platform: "iOS", brand: "아우라픽", acquisitionFlow: "네이티브 API 파싱", entryPattern: "pos.aurapic.co.kr / aurapic.co.kr", extractionRule: "query s → shoot-data JSON → urlFolderPath", imageRule: "/api/data-download{folder}/image.jpg", expectedFormat: "JPG", resultType: "originalImage Data" },
  { id: "ios-native-haru", platform: "iOS", brand: "하루필름", acquisitionFlow: "네이티브 URL 조립", entryPattern: "haru*.mx2.co.kr", extractionRule: "QR path에서 ID 추출", imageRule: "/download/album/{id}/output/output.jpg", expectedFormat: "JPG", resultType: "originalImage Data" },
  { id: "ios-redirect-photogray", platform: "iOS", brand: "포토그레이", acquisitionFlow: "리다이렉트·Base64 파싱", entryPattern: "aprd.io / pgshort.aprd.io", extractionRule: "final URL id → Base64 → sessionId", imageRule: "/{sessionId}/image.jpg", expectedFormat: "JPG", resultType: "originalImage Data" },
  { id: "ios-native-photosignature-code", platform: "iOS", brand: "포토시그니처", variant: "CODE", acquisitionFlow: "네이티브 URL 조립", entryPattern: "imagenetworks.web.app", extractionRule: "/v/{sessionID} 검증", imageRule: "/sessions/{sessionID}/final.jpg", expectedFormat: "JPG", resultType: "originalImage Data" },
  { id: "ios-native-photosignature", platform: "iOS", brand: "포토시그니처", variant: "구형·뷰어", acquisitionFlow: "네이티브 URL 조립", entryPattern: "photoqr3.kr / photosignature-viewer.web.app", extractionRule: "index.html→a.jpg 또는 view/{sessionID} 추출", imageRule: "/a.jpg 또는 /sessions/{sessionID}/final.jpg", expectedFormat: "JPG", resultType: "originalImage Data" },
  { id: "ios-redirect-life4cut", platform: "iOS", brand: "인생네컷", acquisitionFlow: "리다이렉트 쿼리 파싱", entryPattern: "life4cut.net 계열", extractionRule: "최종 URL bucket·region·folderPath 추출", imageRule: "S3 {folderPath}/image.jpg + Referer", expectedFormat: "JPG", resultType: "originalImage Data" },
  { id: "ios-html-monomansion", platform: "iOS", brand: "모노맨션", acquisitionFlow: "HTML 링크 추출", entryPattern: "qr.mono-mansion.com", extractionRule: "HTML href 정규식에서 ncloudstorage 링크 추출", imageRule: "ncloudstorage.com 포함 + .jpg 종료", expectedFormat: "JPG", resultType: "originalImage Data" },
  { id: "ios-webview-photoism", platform: "iOS", brand: "포토이즘", acquisitionFlow: "WebView 다운로드", entryPattern: "seobuk.kr", extractionRule: "사용자 다운로드 navigation 감지", imageRule: "jpg/jpeg/png/heic/webp 확장자 또는 blob Base64", expectedFormat: "JPG·JPEG·PNG·HEIC·WebP", resultType: "originalImage Data", notes: "blob은 text/html만 제외합니다." },
];
