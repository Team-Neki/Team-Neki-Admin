// Current extraction contracts; pending entries retain the earlier audit history.
export const brandMethodEvidence = {
  "brand-01": { url: "https://lifefourcuts.com/Frame01", text: "인생네컷 홈페이지 → life4cuts_official", scope: "공식 Instagram 공개 게시물. 좋아요·댓글 수 없이 계정명으로 시작하는 메타데이터에서도 작성자·게시일·캡션을 추출한다. 기존 웹 갤러리 313건은 과거 저장본으로만 보존하고 현재 보고서에서 제외한다. 고정 게시물과 최신 게시물이 함께 노출될 수 있다." },
  "brand-02": { url: "https://photoism.co.kr/", text: "포토이즘 홈페이지 → photoism.kr", scope: "공식 계정의 공개 목록. /287 일반 촬영 샘플은 프레임 소식에서 제외했다. 프레임별 매장·팝업 제외 조건은 본문에 보존하되 자동 적용하지 않는다." },
  "brand-03": { url: "https://photogray.com/", text: "포토그레이 홈페이지 → photogray_official", scope: "한국 공식 계정에 게시된 해외 KCON 팝업 안내도 포함한다. 국내 전 부스 적용으로 해석하지 않으며 지역·기간은 원문 확인이 필요하다." },
  "brand-04": { url: "https://harufilm.com/301", text: "하루필름 공식 공지", scope: "첫 공지 목록 100개. 한 공지가 여러 프레임을 소개해도 원문 글 1개로 계산한다." },
  "brand-05": { url: "https://photosignature.co.kr/bbs/board.php?bo_table=frame", text: "포토시그니처 공식 한정판 프레임 게시판", scope: "첫 목록 12개. 게시일과 촬영 기간은 다른 값이며 원문 종료 표기를 별도로 보존한다." },
  "brand-14": { url: "https://dontlxxkup.kr/", text: "돈룩업 홈페이지 → dontlookup.official", scope: "공개 목록의 공식 계정 명의 글. 페스티벌 경품 이벤트와 촬영 프레임 공지는 다른 종류로 보존한다. 다른 계정 명의 공동 게시물은 제외한다." },
};
export const parserMethods = {
  "imweb-gallery": {
    method: "공식 네컷프레임 갤러리 HTML을 1회 GET 요청해 각 이미지 카드의 ID·제목·원본 이미지 URL을 추출한다.",
    fields: "gal_item 숫자 ID, .title 텍스트, data-src 원본 이미지 URL, 갤러리 캡션 위치 링크",
    steps: ["https://lifefourcuts.com/Frame01의 응답 HTML을 Cheerio로 읽는다. 로그인·JavaScript 실행은 필요 없다.", " .text_wrap[id^='gal_item_']만 고른다. 이미지 영역과 투명 오버레이가 같은 ID를 반복하므로 gal_item_<숫자>를 기준으로 한 번만 남긴다.", ".title은 원문 그대로, data-src는 이미지 주소로 저장한다. 상세 글이 없는 갤러리이므로 원문 링크는 #caption_<ID> 위치 링크이며 개별 게시글 URL이 아니다.", "게시일은 원문에 없으면 null이다. CDN 경로의 업로드 날짜나 ‘2026년 2월’이라는 제목을 게시일·촬영 기간으로 바꾸지 않는다.", "프레임 카테고리는 공식 네컷프레임 갤러리라는 출처 근거다. 신규 ID와 제목·이미지 URL 변경은 검토 대기로 남긴다."],
    limits: "갤러리의 최신 제목은 2026년 2월이며 최신 SNS 전체 소식을 보장하지 않는다. 제목 누락은 ‘제목 미표기’와 검토 경고로 표시한다. 이미지 안의 기간은 OCR하지 않았다.",
  },
  "instagram-public": {
    method: "공식 홈페이지에서 확인한 Instagram 계정을 로그인 없는 Chrome으로 열고, 공개 프로필에 보이는 게시물의 상세 메타데이터를 순차 수집한다.",
    fields: "shortcode, 계정명이 포함된 원문 URL, 게시일, 캡션 첫 유효 문단(최대 180자), 캡션 본문, og:image URL",
    steps: ["공식 홈페이지의 Instagram 링크로 계정 소유 근거를 확인한다. 새 익명 브라우저를 사용하며 저장된 로그인 세션·비공개 API·GraphQL 토큰은 쓰지 않는다.", "프로필을 렌더링하고 a[href*='/p/'], a[href*='/reel/']에서 해당 공식 계정 경로의 링크만 남긴다. 다른 계정 명의의 공동 게시물은 이번 수집에서 제외한다.", "신규 ID → 기한이 된 실패 게시물 → 24시간 지난 기존 게시물 순으로 최대 12개 상세를 연다. 각 상세 이동 전 2초 간격을 두고 이미지·영상·폰트 다운로드는 차단한다. 출처당 수집 예산은 120초다. 전체 계정 백필이나 무한 스크롤은 하지 않는다.", "og:url·og:description·og:image만 읽는다. description에 공식 계정 작성자 표기가 있는지 다시 검증한다. 댓글 작성자·댓글 본문·팔로워 목록은 저장하지 않는다.", "description의 영문 월·일·연도에서 게시일을 읽고, 캡션의 첫 유효 문단을 최대 180자의 제목으로 삼는다. 빈 줄·장식 공백·해시태그 단독 줄을 제외하되 #EVENT 근거는 제목에 남긴다. 캡션은 최대 2,000자 보존한다.", "shortcode가 원문 ID다. 제목·캡션·날짜·이미지 경로의 SHA-256으로 변경을 감지한다. Instagram CDN 서명·쿼리 변경은 내용 수정에서 제외하고 새 이미지 URL만 갱신한다. 경로가 달라지면 재검토한다.", "문서와 1차 도메인 XHR/fetch의 429·로그인 전환·접근 제한이면 해당 출처를 즉시 중단한다. 실패 URL·단계·횟수·다음 시각을 저장하고 3회 실패하면 수동 검토로 전환한다. 상세 메타데이터 실패가 3회 연속이면 중단한다. 일부만 읽었으면 전체 성공이 아닌 부분 실패로 기록하며 읽은 글과 이전 저장본을 함께 보존한다."],
    limits: "공개 화면에 노출된 최대 12개만 읽으므로 최신 전체·공동 게시물·과거 전체를 보장하지 않는다. 이미지에만 있는 제목·기간은 미확인이다. Instagram 정책상 안정적인 무인 반복 수집과 이미지 이용 권한은 별도 검토가 필요하다.",
  },
  photosignature: {
    method: "공식 한정판 프레임 게시판의 공개 HTML을 GET 요청하고 목록 카드를 파싱한다. wr_id를 게시물 ID로 사용한다.",
    fields: "제목, 상세 URL, 썸네일, HTML 주석의 게시일, 텍스트 촬영 기간",
    steps: ["한정판 프레임 게시판 목록 HTML을 GET 1회로 읽고 #bo_gall .listBox > li만 선택한다.", "a[href*='wr_id=']의 wr_id를 ID로 사용하고 bo_table=frame인 공식 도메인의 상세 URL만 허용한다.", ".txtBox h3 제목, .imgBox img 썸네일, HTML 주석의 bo_info 게시일, 표시된 기간 텍스트를 읽는다.", "기간의 연도는 명시된 연도 또는 검증된 게시일로만 보정한다. 종료일·연도가 없으면 null로 남긴다. 상세 페이지 추가 요청·이미지 OCR은 하지 않는다."],
    limits: "연도는 게시일 근거가 있을 때만 보정한다. 종료일 누락과 부스별 적용 여부는 별도 검토한다.",
  },
  "harufilm-news": {
    method: "공식 공지 목록의 공개 HTML을 GET 요청하고 카드의 제목·날짜·이미지를 파싱한다. onclick 문자열에서 상세 URL과 idx만 읽고 JavaScript는 실행하지 않는다.",
    fields: "게시물 ID, 제목, 게시일, 상세 URL, 썸네일, 목록 텍스트",
    steps: ["공식 /301 공지 목록 HTML을 GET 1회로 읽는다. .card[onclick*='bmode=view']를 선택한다.", "onclick의 location.href 문자열에서 idx와 상세 URL만 읽는다. 원문 JavaScript는 실행하지 않는다.", ".title에서 아이콘과 공지 뱃지를 제거하고 .date의 YYYY-MM-DD 게시일, img[data-original] 썸네일, .text-block 텍스트를 읽는다.", "제목의 프레임·콜라보·이벤트 키워드를 분류 근거로 사용한다. 첫 목록에 있는 100건 범위이며 상세 포스터의 촬영 기간은 OCR하지 않는다."],
    limits: "목록 텍스트만 읽는다. 상세 이미지의 촬영 기간은 OCR하지 않으며 포트폴리오를 활성 프레임으로 간주하지 않는다.",
  },
  photomatic: {
    method: "공식 NOTICE 페이지의 공개 HTML을 GET 요청하고 BOOTH·EVENT 아코디언을 읽는다. BOOTH는 프레임 제목만 남기고 collapse_header ID로 상세 URL을 구성한다.",
    fields: "게시물 ID, 제목, 본문 텍스트, 첫 이미지, 텍스트 기간, 제목의 종료 표기",
    limits: "게시일은 미표기다. 연도 근거가 없는 기간은 저장하지 않으며 ‘종료’는 원문 표기이지 실시간 부스 상태가 아니다.",
  },
  "naver-rss": {
    method: "공식 블로그 RSS XML의 item을 파싱한다. picdot_official 계정의 blog.naver.com 링크만 허용하고 글 번호로 중복 제거한다.",
    fields: "게시물 ID, 제목, 발행일(한국 날짜), 원문 URL, RSS 요약, 요약의 첫 이미지",
    limits: "RSS 목록만 읽고 일반 소식도 보존한다. 블로그 전체 이력이나 이미지 속 기간을 수집한 것은 아니다.",
  },
};

export const pendingMethods = {
  "brand-01": { method: "프레임 갤러리·이벤트 목록을 확인했다. 갤러리는 과거 자료 후보 경로이며 최신 소식은 공식 SNS 게시물 접근을 추가 검증해야 한다.", limits: "갤러리 최신성 부족. SNS 게시물 수집 미검증·파서 미구현." },
  "brand-02": { method: "공식 갤러리와 본사가 연결한 Instagram·X를 확인했다. 이미지 카드에 제목·날짜가 없어 SNS 원문 추출을 검증할 경로다.", limits: "공개 프로필 HTML에서 게시물 목록을 얻지 못했다. SNS 수집 미검증·파서 미구현." },
  "brand-03": { method: "공식 사이트의 Instagram 연결을 확인했다. 정기 프레임 목록이 없어 공식 SNS 게시글·이미지를 검토할 경로다.", limits: "프로필 HTML에 게시물 목록 없음. 브라우저 게시물 접근 미검증·파서 미구현." },
  "brand-07": { method: "ISSUE 페이지를 확인했다. 정상 HTTPS 페이지 또는 공식 SNS 게시물 접근을 검증한 뒤 수집원을 등록해야 한다.", limits: "조사 당시 인증서 만료, ISSUE는 2022년 중심. 인증서 우회 수집은 하지 않는다." },
  "brand-08": { method: "프레임 갤러리·콜라보 이미지 카드를 확인했다. 이미지·링크 변경 감지를 검토 후보로 쓰는 방안을 조사했다.", limits: "제목·기간 없음. 변경 감지 미구현이며 촬영 가능한 프레임으로 자동 게시하지 않는다." },
  "brand-09": { method: "소개 페이지는 확인했으나 공식 최신 소식 채널은 미확정이다. 운영사 확인 후 게시판·피드 어댑터를 정해야 한다.", limits: "공식 수집원·방법 미확정. 동명 서비스 혼동 주의." },
  "brand-10": { method: "운영사 사이트와 공식 Instagram 연결을 확인했다. SNS 게시물 추출을 검증하고 사업 사례와 일반 부스 프레임을 구분할 경로다.", limits: "웹 프레임 소식 목록 없음. SNS 수집 미검증·파서 미구현." },
  "brand-11": { method: "운영사 소개 PDF만 확인했다. 고정 자료는 신규 소식 수집원이 아니므로 공식 공지·소셜 채널 확인이 먼저 필요하다.", limits: "최신 게시물 피드 미확보·파서 미구현." },
  "brand-12": { method: "부스별 소식 채널 사례를 확인했다. 부스 단위 원문을 검토하고 본사 공통 적용이 확인된 글만 브랜드 공통 후보로 분리할 경로다.", limits: "본사 공통 피드 미확보. 부스별 수동 검토 제안 단계·자동 수집 미구현." },
  "brand-13": { method: "사이트·SNS 후보를 조사했다. 운영사의 공식 계정 소유를 확인하고 정상 HTTPS 페이지 또는 공개 SNS 게시물 경로를 검증해야 한다.", limits: "조사 당시 인증서 오류·HTTP 406. SNS 후보 공식성 미확정·수집 미구현." },
  "brand-14": { method: "공식 사이트와 Instagram 연결을 확인했다. 공식 SNS 원문 수집 가능성을 검증하고 부스별 적용 문구를 별도 검토할 경로다.", limits: "웹 프레임 목록 없음. SNS 게시물 수집 미검증·파서 미구현." },
  "brand-16": { method: "본사 사이트 후보와 부스별 채널을 조사했다. 본사 공식 채널을 재확인하고 그전에는 부스 단위 원문을 수동 검토할 경로다.", limits: "조사 당시 본사 사이트 DNS 조회 실패. 공식 최신 피드 미확보·수집 미구현." },
  "brand-17": { method: "포트폴리오 이미지·Instagram 링크를 확인했다. 링크 변경을 행사 렌탈 검토 후보로 감지하는 방안을 조사했다.", limits: "제목·기간 없음. 변경 감지 미구현이며 일반 부스 프레임과 B2B 행사 실적을 구분해야 한다." },
};
