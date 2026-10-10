import { normalizeRecords } from "./normalize.mjs";
import { selectedPages, selectSourceRecords } from "./collection-scope.mjs";

const safePostFailure = ({ url, stage, code, attempts, lastAttemptAt, status, nextAttemptAt }) => ({ url, stage, code, attempts, lastAttemptAt, status, nextAttemptAt });

// Explicit public-data allowlist. Never publish browser sessions, HTML dumps,
// response headers, arbitrary exception messages or inactive source history.
export function publicState(state) {
  return { schemaVersion: 1, lastRunAt: state.lastRunAt,
    records: selectSourceRecords(state.records).map((record) => {
      const fields = ["id", "brandId", "sourceKey", "externalId", "sourceUrl", "title", "kind", "publishedOn", "startsOn", "endsOn", "rawDateText", "imageUrl", "excerpt", "fingerprint", "fingerprintVersion", "observedAt", "firstSeenAt", "lastSeenAt", "sourceChangedAt", "reviewStatus", "sourceStatus", "needsReview"];
      return Object.fromEntries(fields.filter((field) => record[field] !== undefined).map((field) => [field, record[field]]));
    }),
    diagnostics: selectedPages.map((page) => {
      const diagnostic = state.diagnostics.find((item) => item.sourceKey === page.key) ?? {};
      const fields = ["status", "count", "lastAttemptAt", "lastSuccessAt", "lastPartialAt", "nextAttemptAt", "consecutiveFailures", "failureCode", "retryAfterMs", "listedPosts", "selectedCount", "attemptedDetails", "detailFailures"];
      return { sourceKey: page.key, ...Object.fromEntries(fields.filter((field) => diagnostic[field] !== undefined).map((field) => [field, diagnostic[field]])),
        failedPosts: (diagnostic.failedPosts ?? []).map(safePostFailure) };
    }) };
}

export function createPublicSnapshot(state) {
  const clean = publicState(state);
  const normalized = normalizeRecords(clean.records, { generatedAt: state.lastRunAt });
  if (normalized.rejected.length) throw new Error(`Public snapshot rejected ${normalized.rejected.length} invalid records`);
  return { schemaVersion: 1, generatedAt: normalized.generatedAt,
    sources: selectedPages.map((page) => ({ key: page.key, brandId: page.brandId, brandName: page.brand, url: page.url,
      ...clean.diagnostics.find((item) => item.sourceKey === page.key),
      recordCount: normalized.records.filter((record) => record.source.key === page.key).length })),
    records: normalized.records.map((record) => ({ id: record.id, brandId: record.brand.id, brandName: record.brand.name,
      title: record.title, category: record.classification.primary, publishedOn: record.publishedOn,
      startsOn: record.period.startsOn, endsOn: record.period.endsOn, url: record.source.url,
      observedAt: record.source.observedAt, reviewStatus: record.status.review,
      warnings: record.quality.warnings })) };
}
