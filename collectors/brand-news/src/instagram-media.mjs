import { stableImageIdentity } from "./instagram-access.mjs";

const safeImage = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      && (url.hostname.endsWith(".cdninstagram.com") || url.hostname.endsWith(".fbcdn.net")) ? url.href : null;
  } catch { return null; }
};

// Only accept a carousel attached to the exact post shortcode. Never gather all
// page <img>s: those include avatars, suggested posts and unrelated photographs.
export function instagramImages(documents, shortcode, mainImage) {
  let gallery = [];
  const inspect = (value, depth = 0) => {
    if (!value || typeof value !== "object" || depth > 35) return;
    if (value.shortcode === shortcode || value.code === shortcode) {
      const children = value.carousel_media ?? value.edge_sidecar_to_children?.edges?.map((edge) => edge.node);
      if (Array.isArray(children)) gallery = children.map((item) => item.display_url ?? [...(item.image_versions2?.candidates ?? [])].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url).filter(Boolean);
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
