import type { AdminSnapshot, PoseRecord } from "./types";

const SNAPSHOT_KEY = "neki-admin:prototype-snapshot:v1";
const POSE_DB_NAME = "neki-admin:prototype-media";
const POSE_STORE_NAME = "pose-images";

type StoredPoseRecord = Omit<PoseRecord, "imageUrl"> & { imageUrl?: string };
type StoredAdminSnapshot = Omit<AdminSnapshot, "poses"> & { poses: StoredPoseRecord[] };

const getLocalStorage = () => {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

const isTemporaryImageUrl = (value: string) => value.startsWith("data:") || value.startsWith("blob:");

const dataUrlToBlob = (dataUrl: string) => {
  const [header, encoded] = dataUrl.split(",", 2);
  if (!header || !encoded) throw new Error("이미지 데이터를 읽지 못했습니다.");
  const mimeType = header.match(/data:([^;]+)/)?.[1] ?? "application/octet-stream";
  const binary = atob(encoded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: mimeType });
};

let poseDbPromise: Promise<IDBDatabase | undefined> | undefined;

const openPoseDatabase = () => {
  if (poseDbPromise) return poseDbPromise;
  poseDbPromise = new Promise<IDBDatabase | undefined>((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      resolve(undefined);
      return;
    }
    const request = window.indexedDB.open(POSE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(POSE_STORE_NAME)) {
        request.result.createObjectStore(POSE_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("이미지 저장소를 열지 못했습니다."));
  });
  return poseDbPromise;
};

const waitForTransaction = (transaction: IDBTransaction) => new Promise<void>((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error ?? new Error("이미지를 저장하지 못했습니다."));
  transaction.onabort = () => reject(transaction.error ?? new Error("이미지 저장이 취소되었습니다."));
});

const savePoseImage = async (id: string, imageUrl: string) => {
  try {
    const database = await openPoseDatabase();
    if (!database) return false;
    const transaction = database.transaction(POSE_STORE_NAME, "readwrite");
    transaction.objectStore(POSE_STORE_NAME).put(dataUrlToBlob(imageUrl), id);
    await waitForTransaction(transaction);
    return true;
  } catch {
    return false;
  }
};

const loadPoseImage = async (id: string) => {
  try {
    const database = await openPoseDatabase();
    if (!database) return undefined;
    const transaction = database.transaction(POSE_STORE_NAME, "readonly");
    const request = transaction.objectStore(POSE_STORE_NAME).get(id);
    return await new Promise<string | undefined>((resolve, reject) => {
      request.onsuccess = () => {
        const blob = request.result as Blob | undefined;
        resolve(blob ? URL.createObjectURL(blob) : undefined);
      };
      request.onerror = () => reject(request.error ?? new Error("이미지를 불러오지 못했습니다."));
    });
  } catch {
    return undefined;
  }
};

export const loadLocalAdminSnapshot = async (): Promise<Partial<AdminSnapshot> | undefined> => {
  const storage = getLocalStorage();
  if (!storage) return undefined;
  let parsed: Partial<StoredAdminSnapshot>;
  try {
    const raw = storage.getItem(SNAPSHOT_KEY);
    if (!raw) return undefined;
    parsed = JSON.parse(raw) as Partial<StoredAdminSnapshot>;
  } catch {
    return undefined;
  }

  if (!Array.isArray(parsed.poses)) return parsed as Partial<AdminSnapshot>;
  const poses = await Promise.all(parsed.poses.map(async (pose) => {
    if (pose.imageUrl && !isTemporaryImageUrl(pose.imageUrl)) return pose as PoseRecord;
    const imageUrl = pose.imageUrl?.startsWith("data:") ? pose.imageUrl : await loadPoseImage(pose.id);
    return { ...pose, imageUrl: imageUrl ?? "" } as PoseRecord;
  }));
  return { ...parsed, poses } as Partial<AdminSnapshot>;
};

export const saveLocalAdminSnapshot = async (snapshot: AdminSnapshot) => {
  const storage = getLocalStorage();
  if (!storage) return;

  const poses = await Promise.all(snapshot.poses.map(async (pose): Promise<StoredPoseRecord> => {
    if (!pose.imageUrl.startsWith("data:")) {
      return { ...pose, imageUrl: pose.imageUrl.startsWith("blob:") ? "" : pose.imageUrl };
    }
    const saved = await savePoseImage(pose.id, pose.imageUrl);
    return { ...pose, imageUrl: saved ? "" : pose.imageUrl };
  }));
  const payload: StoredAdminSnapshot = { ...snapshot, poses };
  try {
    storage.setItem(SNAPSHOT_KEY, JSON.stringify(payload));
  } catch {
    // Device-local persistence is best effort; the in-memory prototype remains usable.
  }
};
