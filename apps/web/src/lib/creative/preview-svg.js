/**
 * Local jewellery creative preview SVGs for Content Studio.
 * Used only when Gemini is not keyed — still reviewable before approval.
 * Never used as a fake "live Gemini" success.
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
  const prompt = escapeXml(clip(opts.prompt || "Jewellery creative preview", 120));
  const cx = Math.round(width / 2);
  const cy = Math.round(height / 2.35);
  const ringR = Math.round(Math.min(width, height) / 4.2);
  const stoneR = Math.round(ringR * 0.22);
  const titleSize = Math.max(18, Math.round(width * 0.032));
  const metaSize = Math.max(12, Math.round(width * 0.02));
  const promptSize = Math.max(10, Math.round(width * 0.015));
  const animated = kind === "video" || kind === "animation";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#F7F3EE"/>
      <stop offset="55%" stop-color="#E8DFD4"/>
      <stop offset="100%" stop-color="#C4A484"/>
    </linearGradient>
    <radialGradient id="metal" cx="35%" cy="30%" r="70%">
      <stop offset="0%" stop-color="#F3E3C3"/>
      <stop offset="45%" stop-color="#C9A36A"/>
      <stop offset="100%" stop-color="#8A6A3D"/>
    </radialGradient>
    <radialGradient id="stone" cx="40%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#F8F4EC"/>
      <stop offset="55%" stop-color="#D8C4A0"/>
      <stop offset="100%" stop-color="#7A6244"/>
    </radialGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="${Math.round(ringR * 0.08)}" stdDeviation="${Math.round(ringR * 0.08)}" flood-color="#3B2A1F" flood-opacity="0.28"/>
    </filter>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <ellipse cx="${cx}" cy="${cy + ringR + Math.round(ringR * 0.55)}" rx="${Math.round(ringR * 1.15)}" ry="${Math.round(ringR * 0.22)}" fill="#3B2A1F" opacity="0.12"/>
  <g filter="url(#soft)"${animated ? ` class="piece"` : ""}>
    <circle cx="${cx}" cy="${cy}" r="${ringR}" fill="none" stroke="url(#metal)" stroke-width="${Math.max(10, Math.round(ringR * 0.18))}"/>
    <circle cx="${cx}" cy="${cy - ringR}" r="${stoneR}" fill="url(#stone)" stroke="#E8D7B5" stroke-width="2"/>
    <ellipse cx="${cx - Math.round(stoneR * 0.25)}" cy="${cy - ringR - Math.round(stoneR * 0.2)}" rx="${Math.round(stoneR * 0.35)}" ry="${Math.round(stoneR * 0.2)}" fill="#fff" opacity="0.45"/>
  </g>
  ${
    animated
      ? `<style>
    .piece { transform-origin: ${cx}px ${cy}px; animation: tilt 5s ease-in-out infinite; }
    @keyframes tilt { 0%,100% { transform: rotate(-4deg) scale(1); } 50% { transform: rotate(4deg) scale(1.03); } }
  </style>`
      : ""
  }
  <text x="50%" y="${Math.round(height * 0.78)}" text-anchor="middle" font-family="Georgia, serif" font-size="${titleSize}" fill="#3B2A1F">${title}</text>
  <text x="50%" y="${Math.round(height * 0.83)}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${metaSize}" fill="#6B4F3A">${target} · product preview</text>
  <text x="50%" y="${Math.round(height * 0.88)}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${promptSize}" fill="#8A7464">${prompt}</text>
  <text x="50%" y="${Math.round(height * 0.94)}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="12" fill="#8A7464">Triada Designs · waiting live media</text>
</svg>`;
}

/**
 * @param {Parameters<typeof renderPreviewSvg>[0]} opts
 */
export function previewSvgDataUrl(opts = {}) {
  const svg = renderPreviewSvg(opts);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
