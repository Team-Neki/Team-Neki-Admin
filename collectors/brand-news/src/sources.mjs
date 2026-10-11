// A source is enabled only after its public page has been inspected.
// The remaining brands stay in the registry so missing coverage is visible.
export const brandSources = [
  { brandId: "brand-01", brand: "인생네컷", status: "enabled", sourceUrl: "https://www.instagram.com/life4cuts_official/", reason: "공식 홈페이지가 연결한 공개 SNS 게시물; 로그인 없는 브라우저 추출" },
  { brandId: "brand-02", brand: "포토이즘", status: "enabled", sourceUrl: "https://www.instagram.com/photoism.kr/", reason: "공식 웹사이트가 연결한 공개 SNS 게시물; 로그인 없는 브라우저 추출" },
  { brandId: "brand-03", brand: "포토그레이", status: "enabled", sourceUrl: "https://www.instagram.com/photogray_official/", reason: "공식 웹사이트가 연결한 공개 SNS 게시물; 로그인 없는 브라우저 추출" },
  { brandId: "brand-04", brand: "하루필름", status: "enabled", sourceUrl: "https://harufilm.com/301", reason: "공지 목록에서 원문 ID·제목·게시일 확인" },
  { brandId: "brand-05", brand: "포토시그니처", status: "enabled", sourceUrl: "https://photosignature.co.kr/bbs/board.php?bo_table=frame", reason: "제목·기간·상세 URL이 HTML로 제공됨" },
  { brandId: "brand-06", brand: "포토매틱", status: "enabled", sourceUrl: "https://www.photomatic.co.kr/NOTICE", reason: "프레임·이벤트 게시판은 확인, 날짜 형식은 비정형" },
  { brandId: "brand-07", brand: "포토드링크", status: "review", sourceUrl: "https://photodrink.com/ISSUE", reason: "ISSUE 목록은 있으나 최근 게시·프레임 범위 확인 필요" },
  { brandId: "brand-08", brand: "포토랩플러스", status: "review", sourceUrl: "https://photolabplus.co.kr/freamgallery", reason: "프레임·이벤트 갤러리는 있으나 날짜·최신성 확인 필요" },
  { brandId: "brand-09", brand: "셀픽스", status: "unmapped", sourceUrl: null, reason: "사진 브랜드의 공식 최신 소식 채널을 검증하지 못함" },
  { brandId: "brand-10", brand: "모노맨션", status: "unmapped", sourceUrl: "https://daymood.co.kr/", reason: "운영사 사이트에서 정기 프레임 목록을 확인하지 못함" },
  { brandId: "brand-11", brand: "포토하임", status: "unmapped", sourceUrl: null, reason: "공식 최신 프레임 목록을 검증하지 못함" },
  { brandId: "brand-12", brand: "포토스트리트", status: "unmapped", sourceUrl: null, reason: "본사 공통 채널과 지점별 채널을 구분할 근거 부족" },
  { brandId: "brand-13", brand: "플랜비 스튜디오", status: "unmapped", sourceUrl: "https://planbstudio.co.kr/", reason: "해당 사이트의 인증서 오류로 공식 콘텐츠를 검증하지 못함" },
  { brandId: "brand-14", brand: "돈룩업", status: "enabled", sourceUrl: "https://www.instagram.com/dontlookup.official/", reason: "공식 사이트가 연결한 계정의 공개 게시물 메타데이터 추출" },
  { brandId: "brand-15", brand: "픽닷", status: "enabled", sourceUrl: "https://rss.blog.naver.com/picdot_official.xml", reason: "공식 블로그 RSS에서 ID·제목·게시일·요약 확인" },
  { brandId: "brand-16", brand: "비룸 스튜디오", status: "unmapped", sourceUrl: null, reason: "지점별 SNS 외 본사 최신 소식 채널을 검증하지 못함" },
  { brandId: "brand-17", brand: "아우라픽", status: "review", sourceUrl: "https://aurapic.kr/Portfolio", reason: "포트폴리오는 확인, 소비자 촬영 가능 프레임과는 별개" },
];

export const collectionPages = [
  // Retain the old gallery contract for saved history; exclude it from current collection and reports.
  { key: "lifefourcuts-frames", brandId: "brand-01", brand: "인생네컷", kind: "frame", url: "https://lifefourcuts.com/Frame01", parser: "imweb-gallery", active: false },
  { key: "lifefourcuts-instagram", brandId: "brand-01", brand: "인생네컷", kind: "news", url: "https://www.instagram.com/life4cuts_official/", parser: "instagram-public", account: "life4cuts_official" },
  { key: "photoism-instagram", brandId: "brand-02", brand: "포토이즘", kind: "news", url: "https://www.instagram.com/photoism.kr/", parser: "instagram-public", account: "photoism.kr" },
  { key: "photogray-instagram", brandId: "brand-03", brand: "포토그레이", kind: "news", url: "https://www.instagram.com/photogray_official/", parser: "instagram-public", account: "photogray_official" },
  { key: "dontlookup-instagram", brandId: "brand-14", brand: "돈룩업", kind: "news", url: "https://www.instagram.com/dontlookup.official/", parser: "instagram-public", account: "dontlookup.official" },
  { key: "photosignature-frames", brandId: "brand-05", brand: "포토시그니처", kind: "frame", url: "https://photosignature.co.kr/bbs/board.php?bo_table=frame", parser: "photosignature" },
  { key: "harufilm-news", brandId: "brand-04", brand: "하루필름", kind: "news", url: "https://harufilm.com/301", parser: "harufilm-news" },
  { key: "photomatic-notice", brandId: "brand-06", brand: "포토매틱", kind: "event", url: "https://www.photomatic.co.kr/NOTICE", parser: "photomatic" },
  { key: "picdot-blog", brandId: "brand-15", brand: "픽닷", kind: "news", url: "https://rss.blog.naver.com/picdot_official.xml", parser: "naver-rss", account: "picdot_official" },
];
