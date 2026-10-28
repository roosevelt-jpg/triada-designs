/**
 * Mutable dual-run media asset store keyed by content item id.
 */

/** @type {Map<string, { assets: object[], variants: object[] }>} */
const byContent = new Map();

function ensureBucket(contentId) {
  const id = String(contentId || "");
  if (!byContent.has(id)) {
    byContent.set(id, { assets: [], variants: [] });
  }
  return byContent.get(id);
}

/**
 * @param {string} contentId
 */
export function getMediaForContent(contentId) {
  const bucket = ensureBucket(contentId);
  return {
    assets: bucket.assets.slice(),
    variants: bucket.variants.slice(),
  };
}

/**
 * @param {string} contentId
 * @param {object} asset
 */
export function upsertMediaAsset(contentId, asset) {
  const bucket = ensureBucket(contentId);
  const next = {
    id: asset.id || `asset-${contentId}-${Date.now()}`,
    content_item_id: contentId,
    kind: asset.kind || "image",
    mode: asset.mode || "local_sim",
    width: asset.width || 1080,
    height: asset.height || 1080,
    aspect_ratio: asset.aspect_ratio || null,
    duration_ms: asset.duration_ms || null,
    url: asset.url || null,
    mime_type: asset.mime_type || "image/svg+xml",
    prompt: asset.prompt || null,
    metadata: asset.metadata || {},
    created_at: asset.created_at || new Date().toISOString(),
  };

  const idx = bucket.assets.findIndex(
    (a) => a.kind === next.kind && !a.metadata?.platform_target
  );
  if (idx >= 0 && !next.metadata?.platform_target) {
    bucket.assets[idx] = { ...bucket.assets[idx], ...next };
  } else {
    bucket.assets.unshift(next);
  }
  bucket.assets = bucket.assets.slice(0, 24);
  return next;
}

/**
 * @param {string} contentId
 * @param {object[]} variants
 */
export function setMediaVariants(contentId, variants) {
  const bucket = ensureBucket(contentId);
  bucket.variants = (variants || []).slice(0, 24);
  return bucket.variants;
}
