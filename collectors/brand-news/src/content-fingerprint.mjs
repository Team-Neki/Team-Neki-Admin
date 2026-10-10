import { createHash } from "node:crypto";
import { stableImageIdentity } from "./instagram-access.mjs";

export function contentFingerprint(record) {
  return createHash("sha256").update(JSON.stringify([
    record.title, record.rawDateText ?? "", record.publishedOn ?? null,
    stableImageIdentity(record.imageUrl), record.excerpt ?? null,
  ])).digest("hex");
}
