/**
 * Local jewellery creative preview SVGs for Content Studio dual-run.
 * Used when live image/video pixels are not keyed — still reviewable before approval.
 */

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function clip(value, max) {
  const text = String(value || "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

/**
 * @param {{
 *   width?: number,
 *   height?: number,
 *   title?: string,
 *   target?: string,
 *   prompt?: string,
 *   kind?: "image"|"video"|"animation",
 * }} opts
 */
export function renderPreviewSvg(opts = {}) {
  const width = Number(opts.width) || 1080;
  const height = Number(opts.height) || 1080;
  const kind = String(opts.kind || "image");
  const title = escapeXml(clip(opts.title || "Triada Designs", 48));
  const target = escapeXml(clip(opts.target || kind, 40));
  const prompt = escapeXml(clip(opts.prompt || "Jewellery creative preview", 160));
  const cx = Math.round(width / 2);
  const cy = Math.round(height / 2.4);
  const radius = Math.round(Math.min(width, height) / 5);
  const titleSize = Math.max(18, Math.round(width * 0.035));
  const metaSize = Math.max(12, Math.round(width * 0.022));
  const promptSize = Math.max(10, Math.round(width * 0.016));
  const animated = kind === "video" || kind === "animation";

  if (animated) {
    const spinCy = Math.round(height / 2);
    const spinR = Math.round(Math.min(width, height) / 6);
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <style>
    .ring { transform-origin: ${cx}px ${spinCy}px; animation: spin 4s linear infinite; }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  </style>
  <rect width="100%" height="100%" fill="#F7F3EE"/>
  <circle class="ring" cx="${cx}" cy="${spinCy}" r="${spinR}" fill="none" stroke="#C4A484" stroke-width="4"/>
  <text x="50%" y="78%" text-anchor="middle" font-family="Georgia, serif" font-size="28" fill="#3B2A1F">${title}</text>
  <text x="50%" y="84%" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="14" fill="#6B4F3A">${prompt}</text>
  <text x="50%" y="94%" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="12" fill="#8A7464">Triada Designs · ${target}</text>
</svg>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#F7F3EE"/>
      <stop offset="55%" stop-color="#E8DFD4"/>
      <stop offset="100%" stop-color="#C4A484"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="#6B4F3A" stroke-width="3" opacity="0.55"/>
  <text x="50%" y="58%" text-anchor="middle" font-family="Georgia, serif" font-size="${titleSize}" fill="#3B2A1F">${title}</text>
  <text x="50%" y="64%" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${metaSize}" fill="#6B4F3A">${target} · ${width}×${height}</text>
  <text x="50%" y="72%" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${promptSize}" fill="#8A7464">${prompt}</text>
  <text x="50%" y="92%" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="12" fill="#8A7464">Triada Designs · creative preview</text>
</svg>`;
}

/**
 * @param {Parameters<typeof renderPreviewSvg>[0]} opts
 */
export function previewSvgDataUrl(opts = {}) {
  const svg = renderPreviewSvg(opts);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
