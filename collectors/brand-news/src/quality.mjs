import { brandSources } from "./sources.mjs";

const countBy = (records, valueOf) => {
  const counts = {};
  for (const record of records) { const key = valueOf(record); counts[key] = (counts[key] ?? 0) + 1; }
  return counts;
};

export function profileDataset(dataset, diagnostics = [], brands = brandSources) {
  const rows = dataset.records;
  const missing = {
    publishedOn: rows.filter((row) => !row.publishedOn).length,
    startsOn: rows.filter((row) => !row.period.startsOn).length,
    endsOn: rows.filter((row) => !row.period.endsOn).length,
    imageUrl: rows.filter((row) => !row.media.imageUrl).length,
  };
  const invalidWarnings = rows.flatMap((row) => row.quality.warnings.filter((warning) => warning.startsWith("invalid-") || ["reversed-period", "unsafe-image-url"].includes(warning)));
  const byBrand = brands.map((brand) => {
    const selected = rows.filter((row) => row.brand.id === brand.brandId);
    const dates = selected.map((row) => row.publishedOn).filter(Boolean).sort();
    return { brandId: brand.brandId, brand: brand.brand, records: selected.length,
      frameEvents: selected.filter((row) => row.relevance === "frame-event").length,
      possibleRelated: selected.filter((row) => row.relevance === "possible-related-news").length,
      byKind: countBy(selected, (row) => row.classification.primary),
      missingPublicationDates: selected.filter((row) => !row.publishedOn).length,
      oldestPublication: dates[0] ?? null, latestPublication: dates.at(-1) ?? null,
      sourceStatus: brand.status, sourceUrl: brand.sourceUrl, reason: brand.reason,
    };
  });
  const frameEvents = rows.filter((row) => row.relevance === "frame-event");
  return {
    schemaVersion: 1, generatedAt: dataset.generatedAt, asOfDay: dataset.asOfDay, grain: dataset.grain,
    counts: { input: dataset.inputCount, normalized: rows.length, rejected: dataset.rejected.length,
      duplicatesCollapsed: dataset.duplicatesCollapsed, uniqueIds: new Set(rows.map((row) => row.id)).size,
      frameEvents: rows.filter((row) => row.relevance === "frame-event").length,
      possibleRelated: rows.filter((row) => row.relevance === "possible-related-news").length,
      partnerships: rows.filter((row) => row.relevance === "partnership").length,
      generalNews: rows.filter((row) => row.relevance === "general-news").length,
      reportedEnded: rows.filter((row) => row.status.reportedEnded).length,
      needsReview: rows.filter((row) => row.status.review === "pending").length,
      withWarnings: rows.filter((row) => row.quality.warnings.length).length,
      invalidOptionalValues: invalidWarnings.length,
    },
    byKind: countBy(rows, (row) => row.classification.primary),
    missing: Object.fromEntries(Object.entries(missing).map(([field, count]) => [field, { count, rate: rows.length ? count / rows.length : null }])),
    frameEventPeriodMissing: { total: frameEvents.length,
      startsOn: frameEvents.filter((row) => !row.period.startsOn).length,
      endsOn: frameEvents.filter((row) => !row.period.endsOn).length },
    warningCounts: countBy(rows.flatMap((row) => row.quality.warnings), (warning) => warning),
    futurePublicationIds: rows.filter((row) => row.quality.warnings.includes("future-publication-date")).map((row) => row.id),
    byBrand, diagnostics,
    checks: { rowCountReconciles: dataset.inputCount === rows.length + dataset.rejected.length + dataset.duplicatesCollapsed,
      uniqueIds: rows.length === new Set(rows.map((row) => row.id)).size,
      validRequiredFields: rows.every((row) => row.id && row.title && row.brand.id && row.source.url && row.source.externalId),
      sourceUrlsHttps: rows.every((row) => row.source.url.startsWith("https://")),
      validPeriodOrder: rows.every((row) => !row.period.startsOn || !row.period.endsOn || row.period.startsOn <= row.period.endsOn),
      noQuarantinedRecords: dataset.rejected.length === 0,
      noInvalidOptionalValues: invalidWarnings.length === 0,
    },
  };
}
