export type LoadMode = "success" | "empty" | "error";

/**
 * 대시보드가 사용하는 화면 전용 조회 모델입니다.
 * 실제 분석 API의 필드명과 enum은 adapter에서 이 모델로 변환합니다.
 */
export type DashboardGranularity = "day" | "week" | "month";

export type DashboardMetricsQuery = {
  granularity: DashboardGranularity;
  anchorDate: string;
};

export type DashboardMetricValue = {
  value: number;
  startDate: string;
  endDate: string;
};

export type DashboardTrendPoint = {
  date: string;
  label: string;
  activeUsers: number;
  totalUsers: number;
  androidUsers: number;
  iosUsers: number;
};

export type DashboardMetrics = {
  hasData: boolean;
  asOfDate: string;
  updatedAt: string;
  activeUsers: {
    dau: DashboardMetricValue;
    wau: DashboardMetricValue;
    mau: DashboardMetricValue;
  };
  totalUsers: number;
  androidUsers: number;
  iosUsers: number;
  trend: DashboardTrendPoint[];
};

export type NotificationAudience = "all" | "android" | "ios" | "selected";
export type NotificationDelivery = "now" | "scheduled";
export type NotificationStatus = "예약 대기" | "발송 완료" | "발송 실패" | "취소";

/**
 * 닉네임 검색 결과를 화면에 표시하기 위한 UI 모델입니다.
 * 실제 사용자 조회 응답은 adapter에서 이 형태로 변환합니다.
 */
export type NotificationRecipient = {
  id: string;
  nickname: string;
  handle: string;
  platform: "Android" | "iOS";
  canReceive: boolean;
};

export type NotificationDraft = {
  title: string;
  content: string;
  destination: string;
  audience: NotificationAudience;
  selectedRecipients: NotificationRecipient[];
  delivery: NotificationDelivery;
  scheduledAt?: string;
};

export type NotificationRecord = NotificationDraft & {
  id: string;
  expectedRecipients: number;
  deliveredRecipients?: number;
  status: NotificationStatus;
  createdAt: string;
  sentAt?: string;
  failureReason?: string;
};

export type StoreStatus = "운영 중" | "폐점";

export type StoreRecord = {
  id: string;
  brand: string;
  name: string;
  sido: string;
  sigungu: string;
  address: string;
  coordinates: string;
  phone: string;
  status: StoreStatus;
  updatedAt: string;
};

export type StoreDraft = Omit<StoreRecord, "id" | "status" | "updatedAt">;

export type AddressSuggestion = {
  id: string;
  address: string;
  coordinates: string;
};

export type BrandRecord = {
  id: string;
  name: string;
  androidQrSupported: boolean;
  iosQrSupported: boolean;
  mapVisible: boolean;
  updatedAt: string;
};

export type BrandDraft = Omit<BrandRecord, "id" | "updatedAt">;

/** 검색어 별칭을 원 단어로 정규화하기 위한 화면 전용 사전 모델입니다. */
export type DictionaryRecord = {
  id: string;
  canonicalTerm: string;
  allowedTerms: string[];
  updatedAt: string;
};

export type DictionaryDraft = Omit<DictionaryRecord, "id" | "updatedAt">;

/**
 * 포즈 화면에서 사용하는 UI 모델입니다.
 * 실제 업로드 API의 필드명/enum과 분리해 두고 adapter에서 변환합니다.
 */
export type PoseRecord = {
  id: string;
  imageUrl: string;
  originalFileName: string;
  peopleCount: number;
  createdAt: string;
};

export type PoseUploadInput = {
  file: File;
  peopleCount: number;
};

export type AnalyticsEventParameter = {
  name: string;
  description: string;
  optional?: boolean;
  values?: string;
};

export type AnalyticsEventRecord = {
  id: string;
  name: string;
  area: string;
  screen: string;
  platform: "Android" | "iOS" | "공통";
  trigger: string;
  parameters: AnalyticsEventParameter[];
  description: string;
  sourceFile: string;
};

export type AnalyticsEventMetric = {
  name: string;
  total: number;
  uniques?: number;
  pctDau?: number;
};

export type AnalyticsActiveUserPoint = {
  date: string;
  value: number;
};

export type AnalyticsRefreshResult = {
  source: "amplitude";
  fetchedAt: string;
  periodStart: string;
  periodEnd: string;
  events: AnalyticsEventMetric[];
  activeUsers: AnalyticsActiveUserPoint[];
};

export type QrParsingRule = {
  id: string;
  platform: "Android" | "iOS";
  brand: string;
  variant?: string;
  acquisitionFlow: string;
  entryPattern: string;
  extractionRule: string;
  imageRule: string;
  expectedFormat: string;
  resultType: string;
  notes?: string;
};

export type AdminSnapshot = {
  notifications: NotificationRecord[];
  stores: StoreRecord[];
  brands: BrandRecord[];
  dictionaries: DictionaryRecord[];
  poses: PoseRecord[];
  analyticsEvents: AnalyticsEventRecord[];
};

/**
 * 화면이 의존하는 유일한 데이터 계약입니다.
 * 실제 API가 준비되면 이 계약을 구현하는 adapter만 추가하고 화면 코드는 유지합니다.
 */
export interface AdminAdapter {
  load(mode?: LoadMode): Promise<AdminSnapshot>;
  getDashboardMetrics(query: DashboardMetricsQuery, mode?: LoadMode): Promise<DashboardMetrics>;
  searchNotificationRecipients(query: string): Promise<NotificationRecipient[]>;
  estimateAudience(draft: NotificationDraft): Promise<number>;
  sendNotification(draft: NotificationDraft, expectedRecipients: number): Promise<NotificationRecord>;
  cancelNotification(id: string): Promise<NotificationRecord>;
  searchAddresses(query: string): Promise<AddressSuggestion[]>;
  findSimilarStores(draft: StoreDraft, excludeId?: string): Promise<StoreRecord[]>;
  saveStore(draft: StoreDraft, id?: string): Promise<StoreRecord>;
  closeStores(ids: string[]): Promise<StoreRecord[]>;
  findSimilarBrands(name: string, excludeId?: string): Promise<BrandRecord[]>;
  saveBrand(draft: BrandDraft, id?: string): Promise<BrandRecord>;
  saveDictionary(draft: DictionaryDraft, id?: string): Promise<DictionaryRecord>;
  uploadPoses(input: PoseUploadInput[]): Promise<PoseRecord[]>;
  refreshAnalytics(): Promise<AnalyticsRefreshResult>;
}
