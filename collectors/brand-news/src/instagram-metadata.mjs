// Public post metadata may omit the engagement-count prefix.
// Anchor before the caption so mentions of an account inside it cannot verify authorship.
export function parseInstagramMetadata(description, account) {
  if (typeof description !== "string" || !/^[A-Za-z0-9._]+$/.test(account ?? "")) return null;
  const author = account.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = description.match(new RegExp(`^(?:[^:\\r\\n"“]+ - )?${author}(?: on | - )([A-Z][a-z]+ \\d{1,2}, \\d{4}):\\s*["“]`));
  if (!match) return null;
  const date = new Date(`${match[1]} 12:00:00 UTC`);
  if (!Number.isFinite(date.getTime())) return null;
  return {
    publishedOn: date.toISOString().slice(0, 10),
    caption: description.slice(match[0].length).replace(/["”]\.\s*$/, "").trim(),
  };
}
