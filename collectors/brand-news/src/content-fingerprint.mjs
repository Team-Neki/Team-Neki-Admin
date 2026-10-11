import { createHash } from "node:crypto";
import { stableImageIdentity } from "./instagram-access.mjs";

export function contentFingerprint(record) {
  const content = [
    record.title, record.rawDateText ?? "", record.publishedOn ?? null,
    stableImageIdentity(record.imageUrl), record.excerpt ?? null,
  ];
  if (record.imageUrls?.length > 1) content.push(record.imageUrls.map(stableImageIdentity));
  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}
