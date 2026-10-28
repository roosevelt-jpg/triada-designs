/**
 * Dual-run popup markets store (local file under writable triada-local dir).
 * Captures Google Places country/city/town + lat/lng pin with each market.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getLocalDataDir } from "@/lib/local-data-dir";

const LOCAL_DIR = getLocalDataDir();
const LOCAL_FILE = path.join(LOCAL_DIR, "popup-markets.json");
const WORKSPACE_ID = "triada-ops";

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  return `popup-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** @returns {Promise<{ markets: object[], applications: object[] }>} */
async function readStore() {
  try {
    const raw = await readFile(LOCAL_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return {
      markets: Array.isArray(parsed.markets) ? parsed.markets : [],
      applications: Array.isArray(parsed.applications) ? parsed.applications : [],
    };
  } catch {
    return { markets: seedMarkets(), applications: [] };
  }
}

/** @param {{ markets: object[], applications: object[] }} data */
async function writeStore(data) {
  await mkdir(LOCAL_DIR, { recursive: true });
  await writeFile(
    LOCAL_FILE,
    JSON.stringify(
      {
        markets: data.markets,
        applications: data.applications,
        updated_at: nowIso(),
      },
      null,
      2,
    ),
    "utf8",
  );
}

function seedMarkets() {
  return [
    {
      id: "popup-1",
      workspace_id: WORKSPACE_ID,
      name: "Dubai Design Week",
      venue: "d3 — Dubai Design District",
      country: "United Arab Emirates",
      city: "Dubai",
      town: "Design District",
      emirate: "Dubai",
      market_type: "festival",
      application_deadline: new Date(Date.now() + 14 * 86400000)
        .toISOString()
        .slice(0, 10),
      fee_aed: 3500,
      contact_email: "markets@example.com",
      contact_name: "Programme team",
      status: "open",
      place_id: "",
      formatted_address: "Dubai Design District - Dubai - United Arab Emirates",
      lat: 25.1885,
      lng: 55.2804,
      metadata: {
        source: "seed",
        location_source: "google_places_seed",
      },
      created_at: nowIso(),
      updated_at: nowIso(),
    },
  ];
}

/**
 * @param {Record<string, unknown>} input
 */
export function shapePopupMarket(input = {}) {
  const lat =
    input.lat != null && input.lat !== ""
      ? Number(input.lat)
      : input.latitude != null
        ? Number(input.latitude)
        : null;
  const lng =
    input.lng != null && input.lng !== ""
      ? Number(input.lng)
      : input.longitude != null
        ? Number(input.longitude)
        : null;

  return {
    id: String(input.id || newId()),
    workspace_id: String(input.workspace_id || WORKSPACE_ID),
    name: String(input.name || "").trim() || "Untitled market",
    venue: input.venue != null ? String(input.venue).trim() : null,
    country: input.country != null ? String(input.country).trim() : "",
    city: input.city != null ? String(input.city).trim() : "Dubai",
    town: input.town != null ? String(input.town).trim() : "",
    emirate: input.emirate != null ? String(input.emirate).trim() : "Dubai",
    market_type: input.market_type != null ? String(input.market_type) : "popup",
    starts_on: input.starts_on || null,
    ends_on: input.ends_on || null,
    application_deadline: input.application_deadline || null,
    fee_aed: input.fee_aed != null ? Number(input.fee_aed) : null,
    contact_email: input.contact_email || null,
    contact_name: input.contact_name || null,
    status: input.status || "watching",
    notes: input.notes || null,
    place_id: input.place_id != null ? String(input.place_id) : "",
    formatted_address:
      input.formatted_address != null ? String(input.formatted_address) : "",
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    metadata: {
      ...(input.metadata && typeof input.metadata === "object" ? input.metadata : {}),
      location_source: "google_places",
      place_id: input.place_id || undefined,
      lat: Number.isFinite(lat) ? lat : undefined,
      lng: Number.isFinite(lng) ? lng : undefined,
      country: input.country || undefined,
      town: input.town || undefined,
    },
    created_at: input.created_at || nowIso(),
    updated_at: nowIso(),
  };
}

export async function listPopupMarkets() {
  const store = await readStore();
  if (!store.markets.length) {
    const seeded = { markets: seedMarkets(), applications: store.applications };
    await writeStore(seeded);
    return seeded.markets;
  }
  return store.markets;
}

/**
 * @param {Record<string, unknown>} input
 */
export async function upsertPopupMarket(input) {
  const store = await readStore();
  const shaped = shapePopupMarket(input);
  const idx = store.markets.findIndex(
    (m) => m.id === shaped.id || (m.name === shaped.name && m.venue === shaped.venue),
  );
  if (idx >= 0) {
    shaped.id = store.markets[idx].id;
    shaped.created_at = store.markets[idx].created_at;
    store.markets[idx] = shaped;
  } else {
    store.markets.unshift(shaped);
  }
  await writeStore(store);
  return shaped;
}

export async function listPopupApplications() {
  const store = await readStore();
  return store.applications;
}

/**
 * @param {string} marketId
 */
export async function draftPopupApplication(marketId) {
  const store = await readStore();
  const market = store.markets.find((m) => m.id === marketId);
  if (!market) {
    throw new Error("Popup market not found");
  }
  const locationLine = [
    market.venue,
    market.town,
    market.city,
    market.country,
    market.lat != null && market.lng != null
      ? `(${Number(market.lat).toFixed(5)}, ${Number(market.lng).toFixed(5)})`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const application = {
    id: `pa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    popup_market_id: market.id,
    subject: `Application — Triada Designs jewellery · ${market.name}`,
    body:
      `Dear ${market.contact_name || "Organiser"},\n\n` +
      `We are Triada Designs, a Dubai jewellery brand. We would like to apply for a stall at ${market.name}` +
      (locationLine ? ` (${locationLine})` : "") +
      `.\n\nKind regards,\nTriada Designs\n`,
    status: "awaiting_approval",
    created_at: nowIso(),
  };
  store.applications.unshift(application);
  market.status = "applying";
  market.updated_at = nowIso();
  await writeStore(store);
  return application;
}

/**
 * @param {string} applicationId
 */
export async function approvePopupApplication(applicationId) {
  const store = await readStore();
  const app = store.applications.find((a) => a.id === applicationId);
  if (!app) throw new Error("Application not found");
  app.status = "approved";
  app.human_approved = true;
  app.approved_at = nowIso();
  const market = store.markets.find((m) => m.id === app.popup_market_id);
  if (market) {
    market.status = "applied";
    market.updated_at = nowIso();
  }
  await writeStore(store);
  return app;
}

export async function scanPopupAlerts() {
  const store = await readStore();
  const soon = Date.now() + 21 * 86400000;
  let alerted = 0;
  for (const market of store.markets) {
    if (!["watching", "open", "alerted"].includes(market.status)) continue;
    const deadline = market.application_deadline
      ? Date.parse(market.application_deadline)
      : NaN;
    if (!Number.isFinite(deadline) || deadline > soon) continue;
    market.status = "alerted";
    market.updated_at = nowIso();
    alerted += 1;
  }
  await writeStore(store);
  return { ok: true, alerted, alerts: [] };
}
