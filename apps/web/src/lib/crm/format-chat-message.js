/**
 * Prose formatting for unified inbox messages (inbound / outbound / AI drafts).
 * Ensures paragraphs, commas, and spaces so nothing is stuck together.
 * Idempotent — safe to run on display and again on send.
 */

/**
 * Protect URLs / emails / decimals from punctuation-spacing rules.
 * @param {string} text
 * @returns {{ text: string, tokens: string[] }}
 */
function protectTokens(text) {
  /** @type {string[]} */
  const tokens = [];
  const stash = (match) => {
    const idx = tokens.length;
    tokens.push(match);
    return `\u0000${idx}\u0000`;
  };
  let out = String(text || "");
  // URLs
  out = out.replace(/https?:\/\/[^\s<>"']+/gi, stash);
  // Emails
  out = out.replace(
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    stash,
  );
  // Decimals / version-like 3.14 or 1,000 (thousands)
  out = out.replace(/\b\d+[.,]\d+\b/g, stash);
  return { text: out, tokens };
}

/**
 * @param {string} text
 * @param {string[]} tokens
 */
function restoreTokens(text, tokens) {
  return String(text || "").replace(/\u0000(\d+)\u0000/g, (_, n) => {
    const i = Number(n);
    return tokens[i] != null ? tokens[i] : "";
  });
}

/**
 * Insert paragraph breaks into a long single-line multi-sentence blob.
 * @param {string} line
 */
function paragraphizeLongLine(line) {
  const raw = String(line || "");
  if (raw.length < 160 || /\n/.test(raw)) return raw;
  // Split after sentence end when next sentence starts with a capital letter.
  const parts = raw.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý])/);
  if (parts.length < 2) return raw;
  /** @type {string[]} */
  const paragraphs = [];
  /** @type {string[]} */
  let bucket = [];
  let bucketLen = 0;
  for (const part of parts) {
    const piece = part.trim();
    if (!piece) continue;
    bucket.push(piece);
    bucketLen += piece.length;
    if (bucketLen >= 140 || bucket.length >= 2) {
      paragraphs.push(bucket.join(" "));
      bucket = [];
      bucketLen = 0;
    }
  }
  if (bucket.length) paragraphs.push(bucket.join(" "));
  return paragraphs.join("\n\n");
}

/**
 * Format a chat message body for inbox display and channel send.
 * @param {unknown} text
 * @returns {string}
 */
export function formatChatMessageBody(text) {
  let s = String(text ?? "");
  if (!s) return "";

  // Normalize newlines; keep intentional paragraph structure.
  s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const protected_ = protectTokens(s);
  s = protected_.text;

  // Remove space before punctuation ( "hello ," → "hello," )
  s = s.replace(/\s+([,.;:!?])/g, "$1");

  // Ensure space after comma when next char is a letter (hello,world → hello, world)
  s = s.replace(/,([A-Za-zÀ-ÿ])/g, ", $1");

  // Ensure space after sentence punctuation when glued to next word
  s = s.replace(/([.!?])([A-Za-zÀ-ÿ])/g, "$1 $2");

  // Colon / semicolon — skip URL scheme leftovers (: already protected in URLs)
  s = s.replace(/:([A-Za-zÀ-ÿ])/g, ": $1");
  s = s.replace(/;([A-Za-zÀ-ÿ])/g, "; $1");

  // Space between closing punctuation/quote and a following word.
  // Skip ASCII apostrophe so contractions (I'm, don't) stay intact.
  s = s.replace(/([)\]"»])([A-Za-zÀ-ÿ])/g, "$1 $2");

  // Missing space between a word and an opening bracket/quote (not apostrophe)
  s = s.replace(/([A-Za-zÀ-ÿ0-9])([(«"])/g, "$1 $2");

  // Collapse runs of spaces/tabs per line; trim line ends
  s = s
    .split("\n")
    .map((line) => line.replace(/[ \t\f\v]+/g, " ").trimEnd())
    .join("\n");

  // Soft paragraphization for long single-line blobs
  if (!/\n/.test(s) && s.length >= 160) {
    s = paragraphizeLongLine(s);
  }

  // Collapse 3+ blank lines to a single paragraph break
  s = s.replace(/\n{3,}/g, "\n\n");

  // Trim outer whitespace but keep internal paragraph breaks
  s = s.replace(/^\n+/, "").replace(/\n+$/, "").trim();

  s = restoreTokens(s, protected_.tokens);
  return s;
}
