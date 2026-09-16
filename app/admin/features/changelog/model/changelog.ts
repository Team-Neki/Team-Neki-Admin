export type ChangelogEntry = {
  type: "추가" | "개선";
  title: string;
};

export type ChangelogRelease = {
  version: string;
  status: "다음 버전" | "현재 버전";
  entries: ChangelogEntry[];
};

export const changelogReleases: ChangelogRelease[] = [
  {
    version: "v0.2.0",
    status: "다음 버전",
    entries: [
      { type: "추가", title: "Amplitude 지표 CSV·JSON 다운로드" },
    ],
  },
  {
    version: "v0.1.0",
    status: "현재 버전",
    entries: [
      { type: "추가", title: "사용자 지표 대시보드" },
      { type: "추가", title: "수동 알림 작성·예약·발송 이력" },
      { type: "추가", title: "부스·브랜드·사전·포즈 관리" },
      { type: "추가", title: "Amplitude 이벤트 지표 조회" },
      { type: "개선", title: "Amplitude 일별 데이터 캐시" },
      { type: "추가", title: "모임통장 연결·거래내역 조회" },
    ],
  },
];
