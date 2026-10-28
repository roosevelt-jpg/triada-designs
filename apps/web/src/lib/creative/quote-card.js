/**
 * Designed quote-card SVG (text + jewellery atmosphere).
 * Reviewable before approval; usable as WhatsApp media preview / local_sim pixel.
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
 * Wrap quote into ~3 lines for SVG text.
 * @param {string} quote
 * @param {number} [maxPerLine]
 */
function wrapQuoteLines(quote, maxPerLine = 34) {
  const words = String(quote || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxPerLine && current) {
      lines.push(current);
      current = word;
      if (lines.length >= 4) break;
    } else {
      current = next;
    }
  }
  if (current && lines.length < 4) lines.push(current);
  return lines.length ? lines : ["Wear your light."];
}

/**
 * @param {{
 *   width?: number,
 *   height?: number,
 *   quote?: string,
 *   attribution?: string,
 *   theme?: string,
 *   brand?: string,
 * }} opts
 */
export function renderQuoteCardSvg(opts = {}) {
  const width = Number(opts.width) || 1080;
  const height = Number(opts.height) || 1080;
  const quote = clip(opts.quote || "Wear what grounds you.", 160);
  const attribution = clip(opts.attribution || "Triada Designs", 48);
  const theme = escapeXml(clip(opts.theme || "inspiration", 40));
  const brand = escapeXml(clip(opts.brand || "Triada Designs", 40));
  const lines = wrapQuoteLines(quote, Math.max(28, Math.round(width / 32)));
  const quoteSize = Math.max(28, Math.round(width * 0.042));
  const attrSize = Math.max(16, Math.round(width * 0.022));
  const startY = Math.round(height * 0.42 - ((lines.length - 1) * quoteSize * 1.25) / 2);

  const textNodes = lines
    .map((line, i) => {
      const y = startY + i * Math.round(quoteSize * 1.35);
      return `<text x="50%" y="${y}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="${quoteSize}" fill="#2C2118">${escapeXml(line)}</text>`;
    })
    .join("\n  ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="qg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#F8F4EE"/>
      <stop offset="48%" stop-color="#EDE4D8"/>
      <stop offset="100%" stop-color="#C9A882"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="38%" r="55%">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#C9A882" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#qg)"/>
  <rect width="100%" height="100%" fill="url(#glow)"/>
  <circle cx="${Math.round(width * 0.18)}" cy="${Math.round(height * 0.22)}" r="${Math.round(width * 0.08)}" fill="none" stroke="#8A6A4A" stroke-width="2" opacity="0.35"/>
  <circle cx="${Math.round(width * 0.82)}" cy="${Math.round(height * 0.78)}" r="${Math.round(width * 0.1)}" fill="none" stroke="#6B4F3A" stroke-width="1.5" opacity="0.28"/>
  <text x="50%" y="${Math.round(height * 0.14)}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${Math.round(width * 0.018)}" letter-spacing="0.28em" fill="#6B4F3A">${escapeXml(brand.toUpperCase())}</text>
  <line x1="${Math.round(width * 0.28)}" y1="${Math.round(height * 0.18)}" x2="${Math.round(width * 0.72)}" y2="${Math.round(height * 0.18)}" stroke="#C4A484" stroke-width="1.5" opacity="0.7"/>
  ${textNodes}
  <text x="50%" y="${Math.round(height * 0.72)}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${attrSize}" fill="#6B4F3A">— ${escapeXml(attribution)}</text>
  <text x="50%" y="${Math.round(height * 0.9)}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${Math.round(width * 0.016)}" fill="#8A7464">${theme} · quote card</text>
</svg>`;
}

/**
 * @param {Parameters<typeof renderQuoteCardSvg>[0]} opts
 */
export function quoteCardDataUrl(opts = {}) {
  const svg = renderQuoteCardSvg(opts);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Strip data-url prefix for base64 WhatsApp upload when needed.
 * @param {string} dataUrl
 */
export function quoteCardBase64(dataUrl) {
  const raw = String(dataUrl || "");
  const comma = raw.indexOf(",");
  if (raw.startsWith("data:") && comma > 0) {
    // SVG data URLs are often URI-encoded, not base64 — re-encode as base64 for Meta.
    const payload = raw.slice(comma + 1);
    if (raw.includes(";base64,")) return payload;
    try {
      return Buffer.from(decodeURIComponent(payload), "utf8").toString("base64");
    } catch {
      return Buffer.from(payload, "utf8").toString("base64");
    }
  }
  return raw;
}
