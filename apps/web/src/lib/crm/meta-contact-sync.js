/**
 * Sync WhatsApp contacts into CRM via Meta Cloud API (Contacts check)
 * plus inbound webhook peers. Phones normalize to E.164 (UAE default).
 * Credentials: Integrations-stored Meta WA fields, then META_WA_* / WHATSAPP_*.
 * Never returns access tokens.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { hasSupabaseAdminCredentials } from "@/lib/supabase/config";
import { listMetaWebhookMockEvents } from "@/lib/supabase/mock-store";
import { integrationRuntimeMode } from "@/lib/integrations/env-presence";
import { resolveWhatsAppCloudCredentials } from "@/lib/integrations/meta-credentials";
import { normalizePhoneToE164 } from "./phone-e164.js";
import { importContactRows, listContacts, upsertContacts } from "./contacts-store.js";
import { getLocalDataDir } from "@/lib/local-data-dir";

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v21.0";
const GRAPH_BASE = (
  process.env.META_GRAPH_BASE || "https://graph.facebook.com"
).replace(/\/$/, "");
const LOCAL_DIR = getLocalDataDir();
const PEERS_FILE = path.join(LOCAL_DIR, "whatsapp-contact-peers.json");

/**
 * Local jewellery WA peers used when Meta is unkeyed / INTEGRATION_MODE=local.
 * @returns {Array<{ phone: string, name: string, wa_id?: string }>}
 */
export function localSimWhatsAppPeers() {
  return [
    {
      phone: "+971501000101",
      name: "Amira Al Hashimi",
      wa_id: "971501000101",
    },
    {
      phone: "+971502000202",
      name: "Noah Rahman",
      wa_id: "971502000202",
    },
    {
      phone: "+971503000303",
      name: "Sara Khouri",
      wa_id: "971503000303",
    },
    {
      phone: "0504000404",
      name: "Layla VIP",
      wa_id: "971504000404",
    },
  ];
}

function graphUrl(resourcePath) {
  return `${GRAPH_BASE}/${GRAPH_VERSION}/${String(resourcePath).replace(/^\//, "")}`;
}

/**
 * @returns {Promise<{
 *   mode: 'live' | 'local_sim',
 *   sendReady: boolean,
 *   tokenSource: string,
 *   phoneNumberIdPresent: boolean,
 * }>}
 */
async function resolveSyncMode() {
  const creds = await resolveWhatsAppCloudCredentials();
  const forceLocal =
    (process.env.INTEGRATION_MODE || "").trim().toLowerCase() === "local";
  const live =
    !forceLocal &&
    creds.sendReady &&
    integrationRuntimeMode(creds.sendReady) === "live";
  return {
    mode: live ? "live" : "local_sim",
    sendReady: creds.sendReady,
    tokenSource: creds.tokenSource,
    phoneNumberIdPresent: Boolean(creds.phoneNumberId),
  };
}

/**
 * Persist discovered WA peers (digits) for subsequent syncs.
 * @param {Array<{ phone_e164: string | null, phone_digits: string | null, name?: string | null, wa_id?: string | null }>} peers
 */
async function rememberPeers(peers) {
  try {
    await mkdir(LOCAL_DIR, { recursive: true });
    let existing = [];
    try {
      const raw = await readFile(PEERS_FILE, "utf8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) existing = parsed;
    } catch {
      // first write
    }
    const byDigits = new Map(
      existing
        .filter((p) => p?.phone_digits)
        .map((p) => [String(p.phone_digits), p]),
    );
    for (const peer of peers) {
      if (!peer.phone_digits) continue;
      byDigits.set(String(peer.phone_digits), {
        phone_e164: peer.phone_e164,
        phone_digits: peer.phone_digits,
        name: peer.name || byDigits.get(String(peer.phone_digits))?.name || null,
        wa_id: peer.wa_id || byDigits.get(String(peer.phone_digits))?.wa_id || null,
        updated_at: new Date().toISOString(),
      });
    }
    await writeFile(
      PEERS_FILE,
      JSON.stringify([...byDigits.values()], null, 2),
      "utf8",
    );
  } catch {
    // serverless FS may be read-only
  }
}

/** @returns {Promise<Array<Record<string, unknown>>>} */
async function readRememberedPeers() {
  try {
    const raw = await readFile(PEERS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Pull WhatsApp sender phones from stored Meta webhook payloads.
 * @returns {Promise<Array<{ phone: string, name: string | null, wa_id: string | null, source: string }>}
 */
export async function collectInboundWhatsAppPeers() {
  /** @type {Array<{ phone: string, name: string | null, wa_id: string | null, source: string }>} */
  const peers = [];

  /** @param {unknown} payload @param {string} source */
  function walkPayload(payload, source) {
    if (!payload || typeof payload !== "object") return;
    const body = /** @type {Record<string, unknown>} */ (payload);
    const entries = Array.isArray(body.entry) ? body.entry : [];
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") continue;
      const changes = Array.isArray(/** @type {any} */ (entry).changes)
        ? /** @type {any} */ (entry).changes
        : [];
      for (const change of changes) {
        const value = change?.value;
        if (!value || typeof value !== "object") continue;
        const contacts = Array.isArray(value.contacts) ? value.contacts : [];
        const messages = Array.isArray(value.messages) ? value.messages : [];
        const contactByWa = new Map();
        for (const c of contacts) {
          const waId = c?.wa_id ? String(c.wa_id) : null;
          const profileName =
            c?.profile && typeof c.profile === "object"
              ? String(c.profile.name || "") || null
              : null;
          if (waId) contactByWa.set(waId, profileName);
        }
        for (const msg of messages) {
          const from = msg?.from != null ? String(msg.from) : null;
          if (!from) continue;
          peers.push({
            phone: from.startsWith("+") ? from : `+${from}`,
            name: contactByWa.get(from) || null,
            wa_id: from.replace(/^\+/, ""),
            source,
          });
        }
        for (const [waId, name] of contactByWa) {
          peers.push({
            phone: waId.startsWith("+") ? waId : `+${waId}`,
            name,
            wa_id: waId.replace(/^\+/, ""),
            source,
          });
        }
      }
    }
  }

  if (hasSupabaseAdminCredentials()) {
    const supabase = createAdminSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase
        .from("meta_webhook_events")
        .select("payload, object_type")
        .order("received_at", { ascending: false })
        .limit(200);
      if (!error && Array.isArray(data)) {
        for (const row of data) {
          if (
            row.object_type &&
            String(row.object_type).toLowerCase().includes("whatsapp") === false &&
            String(row.object_type).toLowerCase() !== "whatsapp_business_account"
          ) {
            // still walk — Meta often uses object: "whatsapp_business_account"
          }
          walkPayload(row.payload, "meta_webhook_supabase");
        }
      }
    }
  }

  const localEvents = await listMetaWebhookMockEvents();
  for (const row of localEvents) {
    walkPayload(row.payload, "meta_webhook_local");
  }

  const remembered = await readRememberedPeers();
  for (const peer of remembered) {
    if (!peer.phone_e164 && !peer.phone_digits) continue;
    peers.push({
      phone: String(peer.phone_e164 || `+${peer.phone_digits}`),
      name: peer.name ? String(peer.name) : null,
      wa_id: peer.wa_id ? String(peer.wa_id) : null,
      source: "remembered_peers",
    });
  }

  return peers;
}

/**
 * Call Meta WhatsApp Contacts API to verify numbers are on WhatsApp.
 * @param {string[]} e164Phones phones with leading +
 * @returns {Promise<{ ok: boolean, mode: string, contacts: Array<Record<string, unknown>>, error?: string }>}
 */
export async function checkWhatsAppContactsOnMeta(e164Phones) {
  const modeInfo = await resolveSyncMode();
  const phones = [...new Set((e164Phones || []).map((p) => String(p || "").trim()).filter(Boolean))];

  if (modeInfo.mode !== "live") {
    const sim = phones.length
      ? phones.map((input) => {
          const normalized = normalizePhoneToE164(input);
          return {
            input,
            status: normalized.ok ? "valid" : "invalid",
            wa_id: normalized.ok ? normalized.phone_digits : null,
            simulated: true,
          };
        })
      : localSimWhatsAppPeers().map((p) => ({
          input: p.phone,
          status: "valid",
          wa_id: p.wa_id || normalizePhoneToE164(p.phone).phone_digits,
          name: p.name,
          simulated: true,
        }));
    return { ok: true, mode: "local_sim", contacts: sim };
  }

  if (!phones.length) {
    return {
      ok: true,
      mode: "live",
      contacts: [],
      error: undefined,
    };
  }

  const creds = await resolveWhatsAppCloudCredentials();
  const response = await fetch(graphUrl(`${creds.phoneNumberId}/contacts`), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      blocking: "wait",
      contacts: phones,
      force_check: true,
    }),
    cache: "no-store",
  });

  const raw = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      mode: "live",
      contacts: [],
      error: raw?.error?.message || `HTTP ${response.status}`,
    };
  }

  const contacts = Array.isArray(raw?.contacts) ? raw.contacts : [];
  return {
    ok: true,
    mode: "live",
    contacts: contacts.map((c) => ({
      input: c.input != null ? String(c.input) : null,
      status: c.status != null ? String(c.status) : null,
      wa_id: c.wa_id != null ? String(c.wa_id) : null,
    })),
  };
}

/**
 * Sync WhatsApp contacts into CRM (alongside CSV upload).
 * @param {{
 *   phones?: string[],
 *   contacts?: Array<{ phone?: string, name?: string, email?: string }>,
 *   include_inbound?: boolean,
 *   include_crm?: boolean,
 *   default_region?: string,
 * }} [opts]
 */
export async function syncWhatsAppContactsToCrm(opts = {}) {
  const defaultRegion = String(opts.default_region || "AE");
  const includeInbound = opts.include_inbound !== false;
  const includeCrm = opts.include_crm === true;
  const modeInfo = await resolveSyncMode();

  /** @type {Map<string, { phone: string, name: string | null, email: string | null, wa_id: string | null, source: string }>} */
  const candidates = new Map();

  /** @param {string} phone @param {{ name?: string | null, email?: string | null, wa_id?: string | null, source?: string }} meta */
  function addCandidate(phone, meta = {}) {
    const normalized = normalizePhoneToE164(phone, { defaultRegion });
    if (!normalized.ok || !normalized.phone_digits) return;
    const key = normalized.phone_digits;
    const prev = candidates.get(key);
    candidates.set(key, {
      phone: normalized.phone_e164 || phone,
      name: meta.name || prev?.name || null,
      email: meta.email || prev?.email || null,
      wa_id: meta.wa_id || prev?.wa_id || key,
      source: meta.source || prev?.source || "whatsapp_meta_sync",
    });
  }

  for (const phone of opts.phones || []) {
    addCandidate(String(phone), { source: "whatsapp_meta_sync_request" });
  }
  for (const row of opts.contacts || []) {
    if (!row?.phone) continue;
    addCandidate(String(row.phone), {
      name: row.name || null,
      email: row.email || null,
      source: "whatsapp_meta_sync_request",
    });
  }

  if (includeInbound) {
    const inbound = await collectInboundWhatsAppPeers();
    for (const peer of inbound) {
      addCandidate(peer.phone, {
        name: peer.name,
        wa_id: peer.wa_id,
        source: peer.source || "whatsapp_inbound",
      });
    }
  }

  if (includeCrm) {
    const listed = await listContacts({});
    for (const c of listed.data) {
      if (c.phone_e164 || c.phone) {
        addCandidate(String(c.phone_e164 || c.phone), {
          name: c.name,
          email: c.email,
          source: "crm_reverify",
        });
      }
    }
  }

  // When unkeyed and no candidates, seed jewellery WA peers so admin sync is usable.
  if (candidates.size === 0 && modeInfo.mode === "local_sim") {
    for (const peer of localSimWhatsAppPeers()) {
      addCandidate(peer.phone, {
        name: peer.name,
        wa_id: peer.wa_id,
        source: "whatsapp_local_sim",
      });
    }
  }

  const e164List = [...candidates.values()].map((c) => c.phone);
  const checked = await checkWhatsAppContactsOnMeta(e164List);

  if (!checked.ok && modeInfo.mode === "live") {
    return {
      ok: false,
      mode: "live",
      token_source: modeInfo.tokenSource,
      phone_number_id_present: modeInfo.phoneNumberIdPresent,
      error: checked.error || "Meta contacts check failed",
      summary: {
        candidates: candidates.size,
        imported: 0,
        created: 0,
        updated: 0,
        invalid: 0,
        on_whatsapp: 0,
      },
      invalid: [],
      imported: [],
    };
  }

  /** @type {Map<string, { status: string, wa_id: string | null, name?: string }>} */
  const checkByInput = new Map();
  for (const row of checked.contacts) {
    const input = row.input != null ? String(row.input) : "";
    const normalized = normalizePhoneToE164(input || row.wa_id, {
      defaultRegion,
    });
    const key = normalized.phone_digits || (row.wa_id ? String(row.wa_id) : "");
    if (!key) continue;
    checkByInput.set(key, {
      status: String(row.status || "valid").toLowerCase(),
      wa_id: row.wa_id ? String(row.wa_id) : key,
      name: row.name ? String(row.name) : undefined,
    });
  }

  const mappedRows = [];
  const invalid = [];
  let onWhatsapp = 0;

  for (const [digits, cand] of candidates) {
    const hit = checkByInput.get(digits);
    const status = hit?.status || (modeInfo.mode === "local_sim" ? "valid" : "unknown");
    const onWa = status === "valid" || Boolean(hit?.wa_id);
    if (onWa) onWhatsapp += 1;

    const normalized = normalizePhoneToE164(cand.phone, { defaultRegion });
    if (!normalized.ok) {
      invalid.push({
        phone_raw: cand.phone,
        name: cand.name,
        error: normalized.error || "invalid_phone",
      });
      continue;
    }

    // Only persist numbers Meta confirms (or local_sim valid). Skip explicit invalid.
    if (hit && status === "invalid") {
      invalid.push({
        phone_raw: cand.phone,
        name: cand.name,
        error: "not_on_whatsapp",
      });
      continue;
    }

    mappedRows.push({
      name: cand.name || hit?.name || null,
      email: cand.email || null,
      phone: normalized.phone_e164,
      phone_e164: normalized.phone_e164,
      phone_normalized: normalized.phone_digits,
      phone_valid: true,
      phone_raw: cand.phone,
      source: cand.source.startsWith("whatsapp")
        ? cand.source
        : "whatsapp_meta_sync",
      preferred_language: "en",
      metadata: {
        wa_id: hit?.wa_id || cand.wa_id || digits,
        meta_contact_status: status,
        sync_mode: checked.mode,
      },
    });
  }

  // Shape for importContactRows (expects phone_valid + phone_normalized).
  const imported = mappedRows.length
    ? await importContactRows(
        mappedRows.map((row, idx) => ({
          ...row,
          row_number: idx + 1,
          phone_error: null,
        })),
        { source: "whatsapp_meta_sync" },
      )
    : {
        mode: "local_mock",
        imported: [],
        created: 0,
        updated: 0,
        invalid: [],
        summary: {
          submitted: 0,
          imported: 0,
          created: 0,
          updated: 0,
          invalid: 0,
        },
      };

  // Also upsert metadata for wa_id / source when import skipped name merge edge cases.
  if (mappedRows.length && imported.imported?.length === 0) {
    await upsertContacts(
      mappedRows.map((row) => ({
        name: row.name,
        email: row.email,
        phone: row.phone_e164,
        phone_e164: row.phone_e164,
        phone_normalized: row.phone_normalized,
        phone_valid: true,
        source: "whatsapp_meta_sync",
        metadata: row.metadata,
      })),
    );
  }

  await rememberPeers(
    mappedRows.map((row) => ({
      phone_e164: row.phone_e164,
      phone_digits: row.phone_normalized,
      name: row.name,
      wa_id: row.metadata?.wa_id ? String(row.metadata.wa_id) : null,
    })),
  );

  return {
    ok: true,
    mode: checked.mode,
    token_source: modeInfo.tokenSource,
    phone_number_id_present: modeInfo.phoneNumberIdPresent,
    store_mode: imported.mode,
    error: null,
    summary: {
      candidates: candidates.size,
      on_whatsapp: onWhatsapp,
      imported: imported.summary?.imported ?? imported.imported?.length ?? 0,
      created: imported.summary?.created ?? imported.created ?? 0,
      updated: imported.summary?.updated ?? imported.updated ?? 0,
      invalid: invalid.length + (imported.invalid?.length || 0),
    },
    invalid: [...invalid, ...(imported.invalid || [])].slice(0, 50),
    imported: (imported.imported || []).slice(0, 50).map((c) => ({
      id: c.id,
      name: c.name,
      phone_e164: c.phone_e164,
      whatsapp_ready: c.whatsapp_ready,
      source: c.source,
    })),
  };
}
