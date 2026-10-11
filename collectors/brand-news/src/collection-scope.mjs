import { brandSources, collectionPages } from "./sources.mjs";

// Active scope; the older source catalog and saved history remain intact.
export const selectedBrandIds = ["brand-02", "brand-03", "brand-01", "brand-05", "brand-04", "brand-14"];
export const selectedBrands = selectedBrandIds.map((id) => brandSources.find((brand) => brand.brandId === id));
export const selectedPages = collectionPages.filter((page) => selectedBrandIds.includes(page.brandId) && page.active !== false);
const archivedSourceKeys = new Set(collectionPages.filter((page) => page.active === false).map((page) => page.key));

export function selectSourceRecords(records) {
  // Keep malformed input for the existing quarantine gate rather than silently hiding it.
  return records.filter((record) => (!record.brandId || selectedBrandIds.includes(record.brandId)) && !archivedSourceKeys.has(record.sourceKey));
}
