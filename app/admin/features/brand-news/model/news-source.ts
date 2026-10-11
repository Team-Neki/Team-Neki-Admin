const officialHosts = new Set(["photosignature.co.kr", "www.photosignature.co.kr", "harufilm.com", "www.harufilm.com"]);

/** Classify the post's origin, not its image CDN. Unknown sources stay unverified. */
export function newsSourceLabel(url: string): string {
  try {
    const { hostname, protocol } = new URL(url);
    if (protocol !== "https:" && protocol !== "http:") return "출처 미확인";
    if (hostname === "instagram.com" || hostname === "www.instagram.com") return "인스타그램";
    if (officialHosts.has(hostname)) return "공식 홈페이지";
    return hostname || "출처 미확인";
  } catch {
    return "출처 미확인";
  }
}
