/**
 * Parse CRM contact upload files (CSV or Excel) into row objects.
 * Browser- and Node-safe. Excel uses the `xlsx` package (dynamic import).
 */

import { normalizePhoneToE164 } from "./phone-e164.js";

const NAME_KEYS = ["name", "full_name", "fullname", "contact", "contact_name", "customer", "customer_name"];
const EMAIL_KEYS = ["email", "e_mail", "email_address", "mail"];
const PHONE_KEYS = [
  "phone",
  "mobile",
  "whatsapp",
  "wa",
  "phone_number",
  "mobile_number",
  "whatsapp_number",
  "cell",
  "tel",
  "telephone",
];
const LANG_KEYS = ["language", "preferred_language", "lang", "locale"];
const SOURCE_KEYS = ["source", "origin", "list"];

/**
 * @param {string} key
 */
function normKey(key) {
  return String(key || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

/**
 * @param {Record<string, unknown>} row
 * @param {string[]} candidates
 */
function pickField(row, candidates) {
  const map = {};
  for (const [k, v] of Object.entries(row || {})) {
    map[normKey(k)] = v;
  }
  for (const c of candidates) {
    if (map[c] != null && String(map[c]).trim() !== "") {
      return String(map[c]).trim();
    }
  }
  return "";
}

/**
 * Minimal RFC4180-ish CSV parse (handles quotes and commas).
 * @param {string} text
 * @returns {string[][]}
 */
export function parseCsvText(text) {
  const input = String(text || "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    const next = input[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some((cell) => String(cell).trim() !== "")) rows.push(row);
      row = [];
      continue;
    }
    field += ch;
  }

  row.push(field);
  if (row.some((cell) => String(cell).trim() !== "")) rows.push(row);
  return rows;
}

/**
 * @param {string[][]} matrix
 * @returns {Record<string, string>[]}
 */
export function matrixToObjects(matrix) {
  if (!matrix.length) return [];
  const headers = matrix[0].map((h, idx) => {
    const cleaned = String(h || "").trim();
    return cleaned || `column_${idx + 1}`;
  });
  const out = [];
  for (let r = 1; r < matrix.length; r += 1) {
    const line = matrix[r];
    if (!line || !line.some((c) => String(c || "").trim())) continue;
    /** @type {Record<string, string>} */
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = line[i] != null ? String(line[i]).trim() : "";
    });
    out.push(obj);
  }
  return out;
}

/**
 * @param {ArrayBuffer | Uint8Array} buffer
 * @returns {Promise<Record<string, string>[]>}
 */
export async function parseExcelBuffer(buffer) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  const rows = /** @type {Record<string, unknown>[]} */ (
    XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false })
  );
  return rows.map((row) => {
    /** @type {Record<string, string>} */
    const out = {};
    for (const [k, v] of Object.entries(row || {})) {
      out[String(k)] = v == null ? "" : String(v).trim();
    }
    return out;
  });
}

/**
 * @param {File | Blob | { name?: string, arrayBuffer: () => Promise<ArrayBuffer>, text?: () => Promise<string> }} file
 * @returns {Promise<{ rows: Record<string, string>[], format: 'csv' | 'excel' }>}
 */
export async function parseContactsUploadFile(file) {
  const name = (file.name || "upload").toLowerCase();
  const isExcel = /\.(xlsx|xls|xlsm)$/i.test(name);

  if (isExcel) {
    const buf = await file.arrayBuffer();
    const rows = await parseExcelBuffer(buf);
    return { rows, format: "excel" };
  }

  // Default: CSV / TSV text
  const text =
    typeof file.text === "function"
      ? await file.text()
      : new TextDecoder("utf-8").decode(await file.arrayBuffer());
  const matrix = parseCsvText(text);
  return { rows: matrixToObjects(matrix), format: "csv" };
}

/**
 * Map a raw spreadsheet row → normalized contact draft (does not persist).
 * @param {Record<string, unknown>} row
 * @param {number} rowNumber 1-based data row (header = 0 conceptually; pass sheet row index)
 * @param {{ defaultRegion?: string, source?: string }} [opts]
 */
export function mapContactUploadRow(row, rowNumber, opts = {}) {
  const name = pickField(row, NAME_KEYS);
  const email = pickField(row, EMAIL_KEYS);
  const phoneRaw = pickField(row, PHONE_KEYS);
  const preferred_language = pickField(row, LANG_KEYS) || "en";
  const sourceHint = pickField(row, SOURCE_KEYS);
  const phone = normalizePhoneToE164(phoneRaw, {
    defaultRegion: opts.defaultRegion || "AE",
  });

  const valid = phone.ok;
  return {
    row_number: rowNumber,
    name: name || null,
    email: email || null,
    phone_raw: phoneRaw || null,
    phone: phone.phone_e164,
    phone_e164: phone.phone_e164,
    phone_normalized: phone.phone_digits,
    phone_valid: valid,
    phone_error: phone.error,
    preferred_language,
    source: opts.source || sourceHint || "upload",
    whatsapp_ready: valid,
  };
}

/**
 * @param {Record<string, string>[]} rows
 * @param {{ defaultRegion?: string, source?: string }} [opts]
 */
export function mapContactUploadRows(rows, opts = {}) {
  const mapped = rows.map((row, idx) => mapContactUploadRow(row, idx + 1, opts));
  const valid = mapped.filter((r) => r.phone_valid);
  const invalid = mapped.filter((r) => !r.phone_valid);
  return {
    rows: mapped,
    valid,
    invalid,
    summary: {
      total: mapped.length,
      valid: valid.length,
      invalid: invalid.length,
    },
  };
}
