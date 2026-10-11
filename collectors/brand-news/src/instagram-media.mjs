import { stableImageIdentity } from "./instagram-access.mjs";
import { isCroppedInstagramImage } from "./instagram-image-quality.mjs";

const safeImage = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      && (url.hostname.endsWith(".cdninstagram.com") || url.hostname.endsWith(".fbcdn.net")) ? url.href : null;
  } catch { return null; }
};

function imageCandidate(item) {
  const candidates = [...(item.image_versions2?.candidates ?? [])];
  if (item.display_url) candidates.push({ url: item.display_url, width: item.original_width, height: item.original_height });
  return candidates.map((candidate) => {
    const url = safeImage(candidate.url);
    if (!url) return null;
    // Keep the signed URL intact. Removing Instagram's crop parameters breaks
    // its signature; select an actual uncropped candidate supplied by the page.
    const cropped = isCroppedInstagramImage(url);
    const pixels = (Number(candidate.width) || 0) * (Number(candidate.height) || 1);
    return { url, cropped, pixels };
  }).filter(Boolean).sort((a, b) => Number(a.cropped) - Number(b.cropped) || b.pixels - a.pixels)[0];
}

function hasHigherQuality(score, previous) {
  for (let index = 0; index < score.length; index += 1) {
    if (score[index] !== previous[index]) return score[index] > previous[index];
  }
  return false;
}

// Only accept a carousel attached to the exact post shortcode. Never gather all
// page <img>s: those include avatars, suggested posts and unrelated photographs.
export function instagramImages(documents, shortcode, mainImage) {
  let gallery = [];
  let quality = [-1, -1, -1];
  const inspect = (value, depth = 0) => {
    if (!value || typeof value !== "object" || depth > 35) return;
    if (value.shortcode === shortcode || value.code === shortcode) {
      const children = value.carousel_media ?? value.edge_sidecar_to_children?.edges?.map((edge) => edge.node);
      const candidates = (Array.isArray(children) && children.length ? children : [value]).map(imageCandidate).filter(Boolean);
      const score = [candidates.length ? candidates.filter((item) => !item.cropped).length / candidates.length : -1, candidates.length, candidates.reduce((sum, item) => sum + item.pixels, 0)];
      // A later grid/thumbnail copy of the same post must not overwrite the
      // full-size detail gallery. Traversal order is not image quality.
      if (candidates.length && hasHigherQuality(score, quality)) { gallery = candidates.map((item) => item.url); quality = score; }
    }
    for (const child of Object.values(value)) if (typeof child === "object") inspect(child, depth + 1);
  };
  for (const document of documents ?? []) {
    if (typeof document !== "string" || document.length > 2_000_000) continue;
    try { inspect(JSON.parse(document)); } catch { /* Public markup is not guaranteed JSON. */ }
  }
  const seen = new Set();
  return [...gallery, ...(gallery.length ? [] : [mainImage])].map(safeImage).filter((url) => {
    if (!url || seen.has(stableImageIdentity(url))) return false;
    seen.add(stableImageIdentity(url)); return true;
  }).slice(0, 20);
}
