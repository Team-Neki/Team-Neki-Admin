import { contentFingerprint } from "./content-fingerprint.mjs";
import { stableImageIdentity } from "./instagram-access.mjs";
import { isCroppedInstagramImage } from "./instagram-image-quality.mjs";

function preserveFullPhotograph(candidate, earlier) {
  if (!isCroppedInstagramImage(candidate.imageUrl) || !earlier?.imageUrl || isCroppedInstagramImage(earlier.imageUrl)
    || stableImageIdentity(candidate.imageUrl) !== stableImageIdentity(earlier.imageUrl)
    || (candidate.imageUrls?.length ?? 0) > 1) return candidate;
  // An OG-only refresh is not evidence that a verified full photograph/gallery
  // disappeared. Keep its URL intact until the source supplies a full refresh.
  const result = { ...candidate, imageUrl: earlier.imageUrl, imageUrls: earlier.imageUrls ?? [earlier.imageUrl], mediaObservedAt: earlier.mediaObservedAt };
  return { ...result, fingerprint: contentFingerprint(result), fingerprintVersion: 2 };
}

export function mergeCandidates(previous, current) {
  const records = new Map((previous?.records ?? []).map((record) => [record.id, record]));
  let inserted = 0;
  let changed = 0;
  const insertedIds = [];
  const changedIds = [];
  for (const incoming of current.candidates) {
    const earlier = records.get(incoming.id);
    const candidate = preserveFullPhotograph(incoming, earlier);
    if (!earlier) {
      records.set(candidate.id, {
        ...candidate,
        firstSeenAt: current.observedAt,
        lastSeenAt: current.observedAt,
        sourceChangedAt: current.observedAt,
        reviewStatus: "pending",
      });
      inserted += 1;
      insertedIds.push(candidate.id);
      continue;
    }
    // Upgrade legacy hashes using their stored content, not as a source edit.
    const previousFingerprint = candidate.fingerprintVersion === 2 && earlier.fingerprintVersion !== 2
      ? contentFingerprint(earlier) : earlier.fingerprint;
    const sourceChanged = previousFingerprint !== candidate.fingerprint;
    records.set(candidate.id, {
      ...earlier,
      ...candidate,
      firstSeenAt: earlier.firstSeenAt,
      lastSeenAt: candidate.observedAt ?? current.observedAt,
      sourceChangedAt: sourceChanged ? current.observedAt : earlier.sourceChangedAt,
      reviewStatus: sourceChanged ? "pending" : earlier.reviewStatus,
    });
    if (sourceChanged) { changed += 1; changedIds.push(candidate.id); }
  }
  return {
    state: {
      schemaVersion: 1,
      lastRunAt: current.observedAt,
      records: [...records.values()].sort((a, b) => a.id.localeCompare(b.id)),
      diagnostics: current.diagnostics,
    },
    inserted,
    changed,
    insertedIds,
    changedIds,
  };
}
