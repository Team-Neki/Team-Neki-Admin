import { mockAddressSuggestions, mockAdminSnapshot, mockNotificationRecipients } from "./mock-admin-data";
import { loadLocalAdminSnapshot, saveLocalAdminSnapshot } from "./local-admin-storage";
import type {
  AdminAdapter,
  AdminSnapshot,
  BrandDraft,
  BrandRecord,
  DashboardGranularity,
  DashboardMetrics,
  DashboardMetricsQuery,
  AnalyticsRefreshResult,
  DictionaryDraft,
  DictionaryRecord,
  LoadMode,
  NotificationDraft,
  NotificationRecord,
  PoseRecord,
  PoseUploadInput,
  StoreDraft,
  StoreRecord,
} from "./types";
import dayjs, { type Dayjs } from "dayjs";

const wait = (delay = 320) => new Promise((resolve) => setTimeout(resolve, delay));

const readImage = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("이미지를 읽지 못했습니다."));
  reader.onerror = () => reject(reader.error ?? new Error("이미지를 읽지 못했습니다."));
  reader.readAsDataURL(file);
});

const state: AdminSnapshot = structuredClone(mockAdminSnapshot);
let stateHydration: Promise<void> | undefined;

const ensureStateHydrated = () => {
  if (stateHydration) return stateHydration;
  stateHydration = loadLocalAdminSnapshot().then((stored) => {
    if (!stored) return;
    if (Array.isArray(stored.notifications)) state.notifications = stored.notifications;
    if (Array.isArray(stored.stores)) state.stores = stored.stores;
    if (Array.isArray(stored.brands)) state.brands = stored.brands;
    if (Array.isArray(stored.dictionaries)) state.dictionaries = stored.dictionaries;
    if (Array.isArray(stored.poses)) state.poses = stored.poses;
    if (Array.isArray(stored.analyticsEvents)) state.analyticsEvents = stored.analyticsEvents;
  });
  return stateHydration;
};

const persistState = () => saveLocalAdminSnapshot(state);

const today = () =>
  new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const DASHBOARD_EPOCH = dayjs("2023-01-01");

const dashboardValuesAt = (date: Dayjs) => {
  const offset = Math.max(0, date.startOf("day").diff(DASHBOARD_EPOCH, "day"));
  const androidUsers = 3240 + (offset * 5) + Math.floor(offset / 3);
  const iosUsers = 3100 + (offset * 4) + Math.floor(offset / 2);
  const totalUsers = 6680 + (offset * 9) + Math.floor(offset / 4);
  const dau = Math.min(totalUsers, Math.round(totalUsers * (0.13 + ((offset % 7) * 0.004))));
  const wau = Math.min(totalUsers, Math.max(dau, Math.round(totalUsers * (0.39 + ((offset % 5) * 0.005)))));
  const mau = Math.min(totalUsers, Math.max(wau, Math.round(totalUsers * (0.72 + ((offset % 3) * 0.006)))));
  return { dau, wau, mau, totalUsers, androidUsers, iosUsers };
};

const dashboardPeriodEnd = (anchor: Dayjs, granularity: DashboardGranularity, rangeEnd?: string) => {
  if (granularity === "range" && rangeEnd) {
    const parsed = dayjs(rangeEnd);
    if (parsed.isValid()) return parsed.endOf("day");
  }
  if (granularity === "week") return anchor.endOf("week");
  if (granularity === "month") return anchor.endOf("month");
  return anchor.endOf("day");
};

const dashboardTrendDates = (end: Dayjs, granularity: DashboardGranularity, rangeStart?: Dayjs) => {
  if (granularity === "range" && rangeStart?.isValid()) {
    const count = Math.max(1, end.diff(rangeStart.startOf("day"), "day") + 1);
    return Array.from({ length: count }, (_, index) => rangeStart.startOf("day").add(index, "day"));
  }
  const unit = granularity === "day" || granularity === "range" ? "day" : granularity;
  const count = granularity === "day" || granularity === "range" ? 14 : 12;
  return Array.from({ length: count }, (_, index) => end.subtract(count - index - 1, unit));
};

const dashboardPointLabel = (date: Dayjs, granularity: DashboardGranularity) => {
  if (granularity === "month") return date.format("YY.M");
  if (granularity === "week") return `${date.format("M.D")} 주`;
  return date.format("M.D");
};

export const mockAdminAdapter: AdminAdapter = {
  async load(mode: LoadMode = "success"): Promise<AdminSnapshot> {
    await wait();
    if (mode === "error") throw new Error("운영 데이터를 불러오지 못했습니다.");
    if (mode === "empty") return { notifications: [], stores: [], brands: [], dictionaries: [], poses: [], analyticsEvents: [] };
    await ensureStateHydrated();
    return structuredClone(state);
  },

  async getDashboardMetrics(query: DashboardMetricsQuery, mode: LoadMode = "success"): Promise<DashboardMetrics> {
    await wait(360);
    if (mode === "error") throw new Error("사용자 지표를 불러오지 못했습니다.");

    const currentDate = dayjs().startOf("day");
    const requestedDate = dayjs(query.anchorDate);
    const safeAnchor = requestedDate.isValid() ? requestedDate : currentDate;
    const requestedRangeStart = query.granularity === "range" ? dayjs(query.rangeStartDate) : undefined;
    const requestedEnd = dashboardPeriodEnd(safeAnchor, query.granularity, query.rangeEndDate).startOf("day");
    const asOf = requestedEnd.isAfter(currentDate) ? currentDate : requestedEnd;
    const values = dashboardValuesAt(asOf);
    const emptyMetric = { value: 0, startDate: asOf.format("YYYY-MM-DD"), endDate: asOf.format("YYYY-MM-DD") };

    if (mode === "empty" || safeAnchor.isBefore(DASHBOARD_EPOCH, "day")) {
      return {
        hasData: false,
        asOfDate: asOf.format("YYYY-MM-DD"),
        updatedAt: `${asOf.format("YYYY-MM-DD")}T09:00:00`,
        activeUsers: { dau: emptyMetric, wau: emptyMetric, mau: emptyMetric },
        totalUsers: 0,
        androidUsers: 0,
        iosUsers: 0,
        trend: [],
      };
    }

    const trend = dashboardTrendDates(asOf, query.granularity, requestedRangeStart)
      .filter((date) => !date.isBefore(DASHBOARD_EPOCH, "day"))
      .map((date) => {
        const point = dashboardValuesAt(date);
        return {
          date: date.format("YYYY-MM-DD"),
          label: dashboardPointLabel(date, query.granularity),
          activeUsers: query.granularity === "day" || query.granularity === "range" ? point.dau : query.granularity === "week" ? point.wau : point.mau,
          totalUsers: point.totalUsers,
          androidUsers: point.androidUsers,
          iosUsers: point.iosUsers,
        };
      });

    return {
      hasData: true,
      asOfDate: asOf.format("YYYY-MM-DD"),
      updatedAt: `${asOf.format("YYYY-MM-DD")}T09:00:00`,
      activeUsers: {
        dau: { value: values.dau, startDate: asOf.format("YYYY-MM-DD"), endDate: asOf.format("YYYY-MM-DD") },
        wau: { value: values.wau, startDate: asOf.subtract(6, "day").format("YYYY-MM-DD"), endDate: asOf.format("YYYY-MM-DD") },
        mau: { value: values.mau, startDate: asOf.subtract(29, "day").format("YYYY-MM-DD"), endDate: asOf.format("YYYY-MM-DD") },
      },
      totalUsers: values.totalUsers,
      androidUsers: values.androidUsers,
      iosUsers: values.iosUsers,
      trend,
    };
  },

  async searchNotificationRecipients(query: string) {
    await wait(280);
    const normalized = query.trim().toLocaleLowerCase();
    const result = normalized
      ? mockNotificationRecipients.filter((recipient) =>
        recipient.nickname.toLocaleLowerCase().includes(normalized) ||
        recipient.handle.toLocaleLowerCase().includes(normalized))
      : mockNotificationRecipients;
    return structuredClone(result.slice(0, 8));
  },

  async estimateAudience(draft: NotificationDraft): Promise<number> {
    await wait(420);
    if (draft.audience === "selected") {
      return new Set(draft.selectedRecipients.filter((recipient) => recipient.canReceive).map((recipient) => recipient.id)).size;
    }
    if (draft.audience === "all") return 12482;
    return draft.audience === "android" ? 6372 : 6110;
  },

  async sendNotification(draft: NotificationDraft, expectedRecipients: number): Promise<NotificationRecord> {
    await wait(620);
    await ensureStateHydrated();
    const isScheduled = draft.delivery === "scheduled";
    const record: NotificationRecord = {
      ...draft,
      selectedRecipients: draft.audience === "selected" ? draft.selectedRecipients : [],
      id: `notification-${Date.now()}`,
      expectedRecipients,
      deliveredRecipients: isScheduled ? undefined : expectedRecipients,
      status: isScheduled ? "예약 대기" : "발송 완료",
      createdAt: new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date()),
      sentAt: isScheduled ? undefined : new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date()),
    };
    state.notifications = [record, ...state.notifications];
    await persistState();
    return structuredClone(record);
  },

  async cancelNotification(id: string): Promise<NotificationRecord> {
    await wait(420);
    await ensureStateHydrated();
    const current = state.notifications.find((item) => item.id === id);
    if (!current) throw new Error("알림 이력을 찾을 수 없습니다.");
    const record: NotificationRecord = { ...current, status: "취소" };
    state.notifications = state.notifications.map((item) => item.id === id ? record : item);
    await persistState();
    return structuredClone(record);
  },

  async searchAddresses(query: string) {
    await wait(260);
    const normalized = query.trim().toLocaleLowerCase();
    const result = normalized
      ? mockAddressSuggestions.filter((item) => item.address.toLocaleLowerCase().includes(normalized))
      : mockAddressSuggestions;
    return structuredClone(result.slice(0, 6));
  },

  async findSimilarStores(draft: StoreDraft, excludeId?: string): Promise<StoreRecord[]> {
    await wait(240);
    await ensureStateHydrated();
    const name = draft.name.trim().toLocaleLowerCase();
    if (name.length < 2) return [];
    return structuredClone(state.stores.filter((store) =>
      store.id !== excludeId &&
      (store.name.toLocaleLowerCase().includes(name) ||
        (Boolean(draft.brand) && store.brand === draft.brand && Boolean(draft.address) && store.address === draft.address)),
    ));
  },

  async saveStore(draft: StoreDraft, id?: string): Promise<StoreRecord> {
    await wait(520);
    await ensureStateHydrated();
    const record: StoreRecord = {
      ...draft,
      id: id ?? `store-${Date.now()}`,
      status: id ? state.stores.find((item) => item.id === id)?.status ?? "운영 중" : "운영 중",
      updatedAt: today(),
    };
    state.stores = id
      ? state.stores.map((item) => (item.id === id ? record : item))
      : [...state.stores, record];
    await persistState();
    return structuredClone(record);
  },

  async closeStores(ids: string[]): Promise<StoreRecord[]> {
    await wait(520);
    await ensureStateHydrated();
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) return [];
    const targets = uniqueIds.map((id) => {
      const current = state.stores.find((item) => item.id === id);
      if (!current || current.status !== "운영 중") throw new Error("폐점 처리할 수 없는 부스가 포함되어 있습니다.");
      return current;
    });
    const records = targets.map((store) => ({ ...store, status: "폐점" as const, updatedAt: today() }));
    const updated = new Map(records.map((record) => [record.id, record]));
    state.stores = state.stores.map((item) => updated.get(item.id) ?? item);
    await persistState();
    return structuredClone(records);
  },

  async findSimilarBrands(name: string, excludeId?: string): Promise<BrandRecord[]> {
    await wait(220);
    await ensureStateHydrated();
    const normalized = name.trim().toLocaleLowerCase();
    if (normalized.length < 2) return [];
    return structuredClone(state.brands.filter((brand) =>
      brand.id !== excludeId && brand.name.toLocaleLowerCase().includes(normalized),
    ));
  },

  async saveBrand(draft: BrandDraft, id?: string): Promise<BrandRecord> {
    await wait(480);
    await ensureStateHydrated();
    const record: BrandRecord = {
      ...draft,
      id: id ?? `brand-${Date.now()}`,
      updatedAt: today(),
    };
    state.brands = id
      ? state.brands.map((item) => (item.id === id ? record : item))
      : [...state.brands, record];
    await persistState();
    return structuredClone(record);
  },

  async saveDictionary(draft: DictionaryDraft, id?: string): Promise<DictionaryRecord> {
    await wait(420);
    await ensureStateHydrated();
    const record: DictionaryRecord = {
      canonicalTerm: draft.canonicalTerm.trim(),
      allowedTerms: [...new Set(draft.allowedTerms.map((term) => term.trim()).filter(Boolean))],
      id: id ?? `dictionary-${Date.now()}`,
      updatedAt: today(),
    };
    state.dictionaries = id
      ? state.dictionaries.map((item) => (item.id === id ? record : item))
      : [record, ...state.dictionaries];
    await persistState();
    return structuredClone(record);
  },

  async uploadPoses(input: PoseUploadInput[]): Promise<PoseRecord[]> {
    await wait(620);
    await ensureStateHydrated();
    const createdAt = new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date());
    const records = await Promise.all(input.map(async ({ file, peopleCount }, index) => ({
      id: `pose-${Date.now()}-${index}`,
      imageUrl: await readImage(file),
      originalFileName: file.name,
      peopleCount,
      createdAt,
    })));
    state.poses = [...records, ...state.poses];
    await persistState();
    return structuredClone(records);
  },

  async refreshAnalytics(): Promise<AnalyticsRefreshResult> {
    throw new Error("Amplitude API 키를 설정한 뒤 다시 시도해 주세요.");
  },
};

// Prototype records are stored per browser. Replace this adapter with a shared API when
// multiple operators or devices need the same source of truth.
