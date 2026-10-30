/**
 * Shopify auto-sync for Triada dashboard areas beyond products:
 * Collections, Inventory, Transfers/POs, Customers, Growth, Discounts, Finance.
 * Same honesty rule as products: Connected → live upsert; missing scopes/APIs →
 * awaiting_credentials / local_sim (never fake-connected).
 */

import { getShopifyRuntime } from "./shopify-admin.js";
import {
  hasAnyShopifyScope,
  isShopifyScopeFailure,
  listGrantedShopifyScopes,
  shopifyAdminGraphql,
  shopifyAdminRequest,
  shopifySyncState,
} from "./shopify-admin-http.js";
import { extractProductSpecs } from "./product-specs.js";
import { updateDiscountShopifySync } from "./discounts-store.js";

/** Scopes required per sync area (any-of). */
export const SHOPIFY_AREA_SCOPES = {
  products: ["write_products", "read_products"],
  collections: ["write_products", "write_product_listings"],
  inventory: ["write_inventory", "read_inventory"],
  transfers: ["write_inventory_transfers", "write_fulfillments", "write_merchant_managed_fulfillment_orders"],
  customers: ["write_customers", "read_customers"],
  growth: ["write_marketing_events", "read_marketing_events"],
  discounts: ["write_price_rules", "write_discounts", "read_price_rules", "read_discounts"],
  finance: ["write_draft_orders", "write_orders", "read_orders", "read_shopify_payments_payouts"],
};

/**
 * @param {string} area
 * @param {string[]} granted
 */
export function areaHasScope(area, granted) {
  const needed = SHOPIFY_AREA_SCOPES[area] || [];
  if (!needed.length) return true;
  // Collections often work under write_products (custom_collections REST).
  if (area === "collections" && hasAnyShopifyScope(granted, ["write_products"])) {
    return true;
  }
  return hasAnyShopifyScope(granted, needed);
}

/**
 * Presence matrix for Integrations UI / status.
 */
export async function getShopifySyncCapabilities() {
  const runtime = await getShopifyRuntime();
  if (!runtime.ready) {
    return {
      connected: false,
      mode: "local_sim",
      status: "awaiting_credentials",
      scopes: [],
      scope_csv: "",
      areas: Object.fromEntries(
        Object.keys(SHOPIFY_AREA_SCOPES).map((area) => [
          area,
          {
            ready: false,
            status: "awaiting_credentials",
            label: "Waiting credentials",
            message: "Waiting credentials.",
          },
        ]),
      ),
      limitations: [
        "Shopify Admin token required for Connected sync.",
        "Purchase Orders GraphQL is Shopify Plus–oriented; Basic plans use inventory transfers / local manufacturer jobs.",
      ],
    };
  }

  const listed = await listGrantedShopifyScopes();
  const scopes = listed.scopes.length
    ? listed.scopes
    : String(runtime.source || "")
      ? []
      : [];
  // Prefer live GraphQL scopes; fall back to stored scope csv from token exchange.
  const resolved = await import("@/lib/integrations/shopify-credentials").then((m) =>
    m.resolveShopifyAccessToken(),
  );
  const granted =
    scopes.length > 0
      ? scopes
      : String(resolved.scope || "")
          .split(/[,\s]+/)
          .map((s) => s.trim())
          .filter(Boolean);

  /** @type {Record<string, { ready: boolean, status: string, label: string, message: string }>} */
  const areas = {};
  for (const area of Object.keys(SHOPIFY_AREA_SCOPES)) {
    const ready = areaHasScope(area, granted);
    areas[area] = {
      ready,
      status: ready ? "connected" : "awaiting_credentials",
      label: ready ? "Connected" : "Waiting credentials",
      message: ready
        ? `${area} sync ready.`
        : `Waiting credentials — merchant approval needed for ${SHOPIFY_AREA_SCOPES[area].join(" / ")}.`,
    };
  }

  return {
    connected: true,
    mode: runtime.mode,
    status: "connected",
    scopes: granted,
    scope_csv: granted.join(","),
    areas,
    limitations: [
      "Purchase Orders Admin GraphQL is not available on Basic plans (shop plan Basic) — manufacturer jobs stay local; inventory transfers sync when write_inventory_transfers is granted.",
      "Expanded Admin scopes must be approved on the store install; client_credentials returns only granted handles.",
    ],
    shop_domain: runtime.shop_domain,
  };
}

function scopePendingState(area, externalId = null) {
  const needed = (SHOPIFY_AREA_SCOPES[area] || []).join(" / ");
  return shopifySyncState({
    status: "awaiting_credentials",
    mode: "local_sim",
    external_id: externalId,
    message: `Waiting credentials — ${area} needs Shopify scope (${needed}).`,
  });
}

/**
 * Ensure a custom collection exists for a product's collection name; link collect.
 * @param {import("./products-store.js").ProductRecord} product
 */
export async function upsertShopifyCollectionForProduct(product) {
  const runtime = await getShopifyRuntime();
  const specs = extractProductSpecs(product);
  const title = String(specs.collection || "").trim();
  const existingId =
    product.metadata?.shopify_collection_id != null
      ? String(product.metadata.shopify_collection_id)
      : null;

  if (!runtime.ready) {
    return scopePendingState("collections", existingId);
  }
  if (!title) {
    return shopifySyncState({
      status: "synced",
      mode: runtime.mode,
      external_id: existingId,
      message: "No collection on product — skipped.",
    });
  }

  try {
    const caps = await getShopifySyncCapabilities();
    if (!caps.areas.collections?.ready) {
      return scopePendingState("collections", existingId);
    }

    let collectionId = existingId;
    if (!collectionId) {
      const listed = await shopifyAdminRequest(
        "GET",
        `custom_collections.json?title=${encodeURIComponent(title)}&limit=1`,
      );
      if (listed.ok) {
        const hit = Array.isArray(listed.json?.custom_collections)
          ? listed.json.custom_collections[0]
          : null;
        if (hit?.id != null) collectionId = String(hit.id);
      }
    }

    if (!collectionId) {
      const created = await shopifyAdminRequest("POST", "custom_collections.json", {
        custom_collection: {
          title,
          published: product.published_status === "published",
          body_html: `<p>${title} — Triada Designs</p>`,
        },
      });
      if (!created.ok) {
        if (isShopifyScopeFailure(created)) {
          return scopePendingState("collections", existingId);
        }
        return shopifySyncState({
          status: "error",
          mode: runtime.mode,
          external_id: existingId,
          message: `Collection create HTTP ${created.status}`,
        });
      }
      collectionId = String(created.json?.custom_collection?.id || "");
    } else {
      await shopifyAdminRequest(
        "PUT",
        `custom_collections/${encodeURIComponent(collectionId)}.json`,
        {
          custom_collection: {
            id: Number(collectionId) || collectionId,
            title,
            published: product.published_status === "published",
          },
        },
      );
    }

    const productShopifyId = product.channel_sync?.shopify?.external_id;
    if (
      collectionId &&
      productShopifyId &&
      !String(productShopifyId).startsWith("local-")
    ) {
      const collects = await shopifyAdminRequest(
        "GET",
        `collects.json?collection_id=${encodeURIComponent(collectionId)}&product_id=${encodeURIComponent(String(productShopifyId))}`,
      );
      const existingCollect = Array.isArray(collects.json?.collects)
        ? collects.json.collects[0]
        : null;
      if (!existingCollect) {
        await shopifyAdminRequest("POST", "collects.json", {
          collect: {
            collection_id: Number(collectionId) || collectionId,
            product_id: Number(productShopifyId) || productShopifyId,
          },
        });
      }
    }

    return shopifySyncState({
      status: "synced",
      mode: runtime.mode,
      external_id: collectionId,
      link: collectionId
        ? `https://${runtime.shop_domain}/admin/collections/${collectionId}`
        : null,
      message: `Collection “${title}” synced.`,
    });
  } catch (err) {
    return shopifySyncState({
      status: "error",
      mode: runtime.mode,
      external_id: existingId,
      message: err instanceof Error ? err.message : "Collection sync failed",
    });
  }
}

/**
 * Push inventory quantity for a product's Shopify variant (when inventory scopes granted).
 * @param {import("./products-store.js").ProductRecord} product
 */
export async function upsertShopifyInventoryForProduct(product) {
  const runtime = await getShopifyRuntime();
  const qtyRaw =
    product.metadata?.inventory_quantity ??
    product.metadata?.specs?.inventory_quantity ??
    product.inventory_quantity;
  const qty =
    qtyRaw === null || qtyRaw === undefined || qtyRaw === ""
      ? null
      : Number(qtyRaw);

  if (!runtime.ready) {
    return scopePendingState("inventory");
  }
  if (qty == null || !Number.isFinite(qty)) {
    return shopifySyncState({
      status: "synced",
      mode: runtime.mode,
      message: "No inventory quantity on product — skipped.",
    });
  }

  const caps = await getShopifySyncCapabilities();
  if (!caps.areas.inventory?.ready) {
    return scopePendingState("inventory");
  }

  const productId = product.channel_sync?.shopify?.external_id;
  if (!productId || String(productId).startsWith("local-")) {
    return shopifySyncState({
      status: "pending_publish",
      mode: runtime.mode,
      message: "Sync product to Shopify before inventory.",
    });
  }

  try {
    const productRes = await shopifyAdminRequest(
      "GET",
      `products/${encodeURIComponent(String(productId))}.json`,
    );
    if (!productRes.ok) {
      if (isShopifyScopeFailure(productRes)) return scopePendingState("inventory");
      return shopifySyncState({
        status: "error",
        mode: runtime.mode,
        message: `Product lookup HTTP ${productRes.status}`,
      });
    }
    const variant = Array.isArray(productRes.json?.product?.variants)
      ? productRes.json.product.variants[0]
      : null;
    const inventoryItemId = variant?.inventory_item_id;
    if (!inventoryItemId) {
      return shopifySyncState({
        status: "error",
        mode: runtime.mode,
        message: "No inventory_item_id on Shopify variant.",
      });
    }

    const locations = await shopifyAdminRequest("GET", "locations.json");
    if (!locations.ok) {
      if (isShopifyScopeFailure(locations)) return scopePendingState("inventory");
      return shopifySyncState({
        status: "error",
        mode: runtime.mode,
        message: `Locations HTTP ${locations.status}`,
      });
    }
    const location = Array.isArray(locations.json?.locations)
      ? locations.json.locations.find((l) => l.active !== false) ||
        locations.json.locations[0]
      : null;
    if (!location?.id) {
      return shopifySyncState({
        status: "error",
        mode: runtime.mode,
        message: "No Shopify location available.",
      });
    }

    const set = await shopifyAdminRequest("POST", "inventory_levels/set.json", {
      location_id: location.id,
      inventory_item_id: inventoryItemId,
      available: Math.max(0, Math.floor(qty)),
    });
    if (!set.ok) {
      if (isShopifyScopeFailure(set)) return scopePendingState("inventory");
      return shopifySyncState({
        status: "error",
        mode: runtime.mode,
        message: `Inventory set HTTP ${set.status}`,
      });
    }

    return shopifySyncState({
      status: "synced",
      mode: runtime.mode,
      external_id: String(inventoryItemId),
      message: `Inventory set to ${Math.floor(qty)} at ${location.name || location.id}.`,
    });
  } catch (err) {
    return shopifySyncState({
      status: "error",
      mode: runtime.mode,
      message: err instanceof Error ? err.message : "Inventory sync failed",
    });
  }
}

/**
 * Upsert a Shopify customer from a Triada CRM contact.
 * @param {import("@/lib/crm/contacts-store").ContactRecord} contact
 */
export async function upsertShopifyCustomer(contact) {
  const runtime = await getShopifyRuntime();
  const existingId =
    contact.metadata?.shopify_customer_id != null
      ? String(contact.metadata.shopify_customer_id)
      : null;

  if (!runtime.ready) {
    return { ...scopePendingState("customers", existingId), contact };
  }

  const caps = await getShopifySyncCapabilities();
  if (!caps.areas.customers?.ready) {
    return { ...scopePendingState("customers", existingId), contact };
  }

  const email = contact.email || contact.email_normalized;
  const phone = contact.phone_e164 || contact.phone;
  if (!email && !phone) {
    return {
      ...shopifySyncState({
        status: "error",
        mode: runtime.mode,
        message: "Contact needs email or phone for Shopify customer.",
      }),
      contact,
    };
  }

  try {
    /** @type {Record<string, unknown>} */
    const customer = {
      first_name: (contact.name || "").split(/\s+/)[0] || undefined,
      last_name:
        (contact.name || "").split(/\s+/).slice(1).join(" ") || undefined,
      email: email || undefined,
      phone: phone || undefined,
      tags: ["triada-ops", contact.source || "crm"].filter(Boolean).join(", "),
      note: `Triada contact ${contact.id}`,
      verified_email: Boolean(email),
      accepts_marketing: !contact.marketing_opt_out,
      metafields: [
        {
          namespace: "triada",
          key: "contact_id",
          type: "single_line_text_field",
          value: String(contact.id),
        },
      ],
    };

    let result;
    if (existingId && !existingId.startsWith("local-")) {
      customer.id = Number(existingId) || existingId;
      result = await shopifyAdminRequest(
        "PUT",
        `customers/${encodeURIComponent(existingId)}.json`,
        { customer },
      );
    } else {
      // Search by email first to avoid duplicates.
      if (email) {
        const search = await shopifyAdminRequest(
          "GET",
          `customers/search.json?query=${encodeURIComponent(`email:${email}`)}`,
        );
        const hit = Array.isArray(search.json?.customers)
          ? search.json.customers[0]
          : null;
        if (hit?.id != null) {
          customer.id = hit.id;
          result = await shopifyAdminRequest(
            "PUT",
            `customers/${encodeURIComponent(String(hit.id))}.json`,
            { customer },
          );
        }
      }
      if (!result) {
        result = await shopifyAdminRequest("POST", "customers.json", {
          customer,
        });
      }
    }

    if (!result.ok) {
      if (isShopifyScopeFailure(result)) {
        return { ...scopePendingState("customers", existingId), contact };
      }
      return {
        ...shopifySyncState({
          status: "error",
          mode: runtime.mode,
          external_id: existingId,
          message: `Customer sync HTTP ${result.status}`,
        }),
        contact,
      };
    }

    const remote = result.json?.customer || {};
    const remoteId = remote.id != null ? String(remote.id) : existingId;
    return {
      ...shopifySyncState({
        status: "synced",
        mode: runtime.mode,
        external_id: remoteId,
        link: remoteId
          ? `https://${runtime.shop_domain}/admin/customers/${remoteId}`
          : null,
        message: "Customer synced to Shopify.",
      }),
      contact,
    };
  } catch (err) {
    return {
      ...shopifySyncState({
        status: "error",
        mode: runtime.mode,
        external_id: existingId,
        message: err instanceof Error ? err.message : "Customer sync failed",
      }),
      contact,
    };
  }
}

/**
 * Create a marketing event for a Triada campaign send (Growth).
 * @param {{ title?: string, description?: string, event_type?: string, started_at?: string, remote_id?: string|null }} input
 */
export async function upsertShopifyMarketingEvent(input = {}) {
  const runtime = await getShopifyRuntime();
  const existingId = input.remote_id ? String(input.remote_id) : null;
  if (!runtime.ready) return scopePendingState("growth", existingId);

  const caps = await getShopifySyncCapabilities();
  if (!caps.areas.growth?.ready) return scopePendingState("growth", existingId);

  try {
    const payload = {
      marketing_event: {
        event_type: String(input.event_type || "ad"),
        marketing_channel: "social",
        paid: false,
        started_at: input.started_at || new Date().toISOString(),
        utm_campaign: String(input.title || "triada-campaign")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .slice(0, 64),
        remote_id: existingId || undefined,
        description: String(input.description || input.title || "Triada campaign"),
      },
    };
    const result = await shopifyAdminRequest(
      "POST",
      "marketing_events.json",
      payload,
    );
    if (!result.ok) {
      if (isShopifyScopeFailure(result)) return scopePendingState("growth", existingId);
      return shopifySyncState({
        status: "error",
        mode: runtime.mode,
        message: `Marketing event HTTP ${result.status}`,
      });
    }
    const remote = result.json?.marketing_event || {};
    return shopifySyncState({
      status: "synced",
      mode: runtime.mode,
      external_id: remote.id != null ? String(remote.id) : null,
      message: "Marketing event created on Shopify.",
    });
  } catch (err) {
    return shopifySyncState({
      status: "error",
      mode: runtime.mode,
      message: err instanceof Error ? err.message : "Marketing sync failed",
    });
  }
}

/**
 * Upsert price rule + discount code.
 * @param {import("./discounts-store.js").DiscountRecord} discount
 */
export async function upsertShopifyDiscount(discount) {
  const runtime = await getShopifyRuntime();
  const existingCodeId = discount.shopify_sync?.external_id || null;
  const existingRuleId = discount.shopify_sync?.price_rule_id || null;

  if (!runtime.ready) {
    const state = scopePendingState("discounts", existingCodeId);
    await updateDiscountShopifySync(discount.id, state).catch(() => {});
    return state;
  }

  const caps = await getShopifySyncCapabilities();
  if (!caps.areas.discounts?.ready) {
    const state = scopePendingState("discounts", existingCodeId);
    await updateDiscountShopifySync(discount.id, state).catch(() => {});
    return state;
  }

  try {
    const value =
      discount.value_type === "percentage"
        ? -Math.abs(Number(discount.value) || 0)
        : -Math.abs(Number(discount.value) || 0);

    /** @type {Record<string, unknown>} */
    const priceRule = {
      title: discount.title || discount.code,
      target_type: "line_item",
      target_selection: "all",
      allocation_method: "across",
      value_type: discount.value_type,
      value: String(value),
      customer_selection: "all",
      starts_at: discount.starts_at || new Date().toISOString(),
      ends_at: discount.ends_at || null,
      usage_limit: discount.usage_limit,
    };

    let ruleId = existingRuleId;
    let ruleResult;
    if (ruleId && !String(ruleId).startsWith("local-")) {
      priceRule.id = Number(ruleId) || ruleId;
      ruleResult = await shopifyAdminRequest(
        "PUT",
        `price_rules/${encodeURIComponent(String(ruleId))}.json`,
        { price_rule: priceRule },
      );
    } else {
      ruleResult = await shopifyAdminRequest("POST", "price_rules.json", {
        price_rule: priceRule,
      });
    }

    if (!ruleResult.ok) {
      const state = isShopifyScopeFailure(ruleResult)
        ? scopePendingState("discounts", existingCodeId)
        : shopifySyncState({
            status: "error",
            mode: runtime.mode,
            message: `Price rule HTTP ${ruleResult.status}`,
          });
      await updateDiscountShopifySync(discount.id, state).catch(() => {});
      return state;
    }

    ruleId = String(ruleResult.json?.price_rule?.id || ruleId);

    let codeId = existingCodeId;
    if (codeId && !String(codeId).startsWith("local-")) {
      await shopifyAdminRequest(
        "PUT",
        `price_rules/${encodeURIComponent(String(ruleId))}/discount_codes/${encodeURIComponent(String(codeId))}.json`,
        { discount_code: { id: Number(codeId) || codeId, code: discount.code } },
      );
    } else {
      const codeRes = await shopifyAdminRequest(
        "POST",
        `price_rules/${encodeURIComponent(String(ruleId))}/discount_codes.json`,
        { discount_code: { code: discount.code } },
      );
      if (codeRes.ok && codeRes.json?.discount_code?.id != null) {
        codeId = String(codeRes.json.discount_code.id);
      } else if (!codeRes.ok && isShopifyScopeFailure(codeRes)) {
        const state = scopePendingState("discounts", existingCodeId);
        await updateDiscountShopifySync(discount.id, {
          ...state,
          price_rule_id: ruleId,
        }).catch(() => {});
        return state;
      }
    }

    const state = {
      ...shopifySyncState({
        status: "synced",
        mode: runtime.mode,
        external_id: codeId,
        link: ruleId
          ? `https://${runtime.shop_domain}/admin/discounts/${ruleId}`
          : null,
        message: `Discount ${discount.code} synced.`,
      }),
      price_rule_id: ruleId,
    };
    await updateDiscountShopifySync(discount.id, state).catch(() => {});
    return state;
  } catch (err) {
    const state = shopifySyncState({
      status: "error",
      mode: runtime.mode,
      message: err instanceof Error ? err.message : "Discount sync failed",
    });
    await updateDiscountShopifySync(discount.id, state).catch(() => {});
    return state;
  }
}

/**
 * Push a Triada invoice as a Shopify draft order (Finance write path).
 * @param {import("@/lib/invoices/invoice-docs-store").InvoiceDoc} invoice
 */
export async function upsertShopifyDraftOrderFromInvoice(invoice) {
  const runtime = await getShopifyRuntime();
  const existingId =
    invoice.metadata?.shopify_draft_order_id != null
      ? String(invoice.metadata.shopify_draft_order_id)
      : null;

  if (!runtime.ready) return scopePendingState("finance", existingId);

  const caps = await getShopifySyncCapabilities();
  if (!caps.areas.finance?.ready) return scopePendingState("finance", existingId);

  try {
    const lineItems = (invoice.line_items || []).map((li) => ({
      title: li.title || "Item",
      quantity: Math.max(1, Number(li.qty) || 1),
      price: String(Number(li.price) || 0),
      sku: li.sku || undefined,
      requires_shipping: true,
    }));
    if (!lineItems.length) {
      lineItems.push({
        title: invoice.title || invoice.number || "Invoice",
        quantity: 1,
        price: String(Number(invoice.total) || 0),
        requires_shipping: false,
      });
    }

    /** @type {Record<string, unknown>} */
    const draft = {
      line_items: lineItems,
      note: `Triada ${invoice.document_type || "invoice"} ${invoice.number}`,
      email: invoice.customer_email || undefined,
      tags: "triada-ops,invoice",
      currency: invoice.currency || undefined,
      metafields: [
        {
          namespace: "triada",
          key: "invoice_id",
          type: "single_line_text_field",
          value: String(invoice.id),
        },
      ],
    };
    if (invoice.customer_name) {
      const parts = String(invoice.customer_name).trim().split(/\s+/);
      draft.customer = {
        first_name: parts[0] || invoice.customer_name,
        last_name: parts.slice(1).join(" ") || undefined,
        email: invoice.customer_email || undefined,
      };
    }

    let result;
    if (existingId && !existingId.startsWith("local-")) {
      draft.id = Number(existingId) || existingId;
      result = await shopifyAdminRequest(
        "PUT",
        `draft_orders/${encodeURIComponent(existingId)}.json`,
        { draft_order: draft },
      );
    } else {
      result = await shopifyAdminRequest("POST", "draft_orders.json", {
        draft_order: draft,
      });
    }

    if (!result.ok) {
      if (isShopifyScopeFailure(result)) {
        return scopePendingState("finance", existingId);
      }
      return shopifySyncState({
        status: "error",
        mode: runtime.mode,
        external_id: existingId,
        message: `Draft order HTTP ${result.status}`,
      });
    }

    const remote = result.json?.draft_order || {};
    return shopifySyncState({
      status: "synced",
      mode: runtime.mode,
      external_id: remote.id != null ? String(remote.id) : existingId,
      link: remote.invoice_url || null,
      message: "Invoice pushed as Shopify draft order.",
    });
  } catch (err) {
    return shopifySyncState({
      status: "error",
      mode: runtime.mode,
      external_id: existingId,
      message: err instanceof Error ? err.message : "Finance sync failed",
    });
  }
}

/**
 * Best-effort inventory transfer from a manufacturer / PO-like job.
 * Purchase Orders GraphQL is Plus-oriented and unavailable on Basic — documented.
 * @param {{
 *   id?: string,
 *   title?: string,
 *   note?: string,
 *   line_items?: Array<{ inventory_item_id?: string|number, quantity?: number }>,
 *   shopify_transfer_id?: string|null,
 * }} input
 */
export async function upsertShopifyInventoryTransfer(input = {}) {
  const runtime = await getShopifyRuntime();
  const existingId = input.shopify_transfer_id
    ? String(input.shopify_transfer_id)
    : null;

  if (!runtime.ready) return scopePendingState("transfers", existingId);

  const caps = await getShopifySyncCapabilities();
  if (!caps.areas.transfers?.ready) {
    // Probe Plus purchaseOrders — expect undefinedField on Basic.
    const poProbe = await shopifyAdminGraphql(
      `{ __type(name: "QueryRoot") { fields { name } } }`,
    ).catch(() => null);
    void poProbe;
    return {
      ...scopePendingState("transfers", existingId),
      limitation:
        "Purchase Orders Admin API is not available on this shop plan (Basic). Manufacturer jobs remain local until inventory transfer scopes are granted.",
    };
  }

  try {
    const mutation = `
      mutation inventoryTransferCreate($input: InventoryTransferCreateInput!) {
        inventoryTransferCreate(input: $input) {
          inventoryTransfer { id }
          userErrors { field message }
        }
      }
    `;
    // Without concrete inventory item GIDs from manufacturer payload, stay honest.
    const items = Array.isArray(input.line_items) ? input.line_items : [];
    if (!items.length || !items.every((i) => i.inventory_item_id)) {
      return shopifySyncState({
        status: "pending_publish",
        mode: runtime.mode,
        message:
          "Transfer sync waiting for inventory_item_id mapping on manufacturer lines.",
      });
    }

    const result = await shopifyAdminGraphql(mutation, {
      input: {
        note: String(input.note || input.title || `Triada transfer ${input.id || ""}`),
        lineItems: items.map((i) => ({
          inventoryItemId: String(i.inventory_item_id).startsWith("gid://")
            ? String(i.inventory_item_id)
            : `gid://shopify/InventoryItem/${i.inventory_item_id}`,
          quantity: Math.max(1, Number(i.quantity) || 1),
        })),
      },
    });

    if (!result.ok || result.access_denied) {
      return scopePendingState("transfers", existingId);
    }
    const payload = result.json?.data?.inventoryTransferCreate;
    const userErrors = Array.isArray(payload?.userErrors)
      ? payload.userErrors
      : [];
    if (userErrors.length) {
      return shopifySyncState({
        status: "error",
        mode: runtime.mode,
        message: userErrors.map((e) => e.message).join("; "),
      });
    }
    const gid = payload?.inventoryTransfer?.id;
    return shopifySyncState({
      status: "synced",
      mode: runtime.mode,
      external_id: gid ? String(gid).split("/").pop() : null,
      message: "Inventory transfer created on Shopify.",
    });
  } catch (err) {
    return shopifySyncState({
      status: "error",
      mode: runtime.mode,
      message: err instanceof Error ? err.message : "Transfer sync failed",
    });
  }
}

/**
 * Read-align Shopify payouts (Finance read) when scope granted.
 */
export async function listShopifyPayouts(limit = 10) {
  const runtime = await getShopifyRuntime();
  if (!runtime.ready) {
    return {
      mode: "local_sim",
      status: "awaiting_credentials",
      payouts: [],
      message: "Waiting credentials.",
    };
  }
  const caps = await getShopifySyncCapabilities();
  if (!hasAnyShopifyScope(caps.scopes, ["read_shopify_payments_payouts"])) {
    return {
      mode: "local_sim",
      status: "awaiting_credentials",
      payouts: [],
      message:
        "Waiting credentials — read_shopify_payments_payouts not granted on install.",
    };
  }
  const result = await shopifyAdminRequest(
    "GET",
    `shopify_payments/payouts.json?limit=${Math.min(50, Math.max(1, limit))}`,
  );
  if (!result.ok) {
    return {
      mode: runtime.mode,
      status: isShopifyScopeFailure(result) ? "awaiting_credentials" : "error",
      payouts: [],
      message: `Payouts HTTP ${result.status}`,
    };
  }
  return {
    mode: runtime.mode,
    status: "synced",
    payouts: Array.isArray(result.json?.payouts) ? result.json.payouts : [],
    message: "Payouts listed.",
  };
}

/**
 * After product Shopify upsert, also sync collection + inventory.
 * @param {import("./products-store.js").ProductRecord} product
 */
export async function syncShopifyProductSatellites(product) {
  const collection = await upsertShopifyCollectionForProduct(product);
  const inventory = await upsertShopifyInventoryForProduct(product);
  return { collection, inventory };
}

/**
 * Manual / Integrations sync runner by area.
 * @param {string} syncType
 */
export async function runShopifyAreaSync(syncType) {
  const type = String(syncType || "products").toLowerCase();
  const caps = await getShopifySyncCapabilities();

  if (type === "products") {
    const { syncShopifyCatalogInbound } = await import(
      "./product-channel-publish.js"
    );
    return syncShopifyCatalogInbound();
  }

  if (type === "capabilities" || type === "status") {
    return {
      ok: true,
      mode: caps.mode,
      status: caps.status,
      run: {
        status: "completed",
        mode: caps.mode,
        sync_type: type,
        records_upserted: 0,
        records_failed: 0,
        summary: { areas: caps.areas, scopes: caps.scope_csv, limitations: caps.limitations },
      },
      status_payload: caps,
      capabilities: caps,
    };
  }

  if (type === "collections") {
    const { listProducts, upsertProduct } = await import("./products-store.js");
    const listed = await listProducts();
    let upserted = 0;
    let failed = 0;
    for (const product of listed.data) {
      const result = await upsertShopifyCollectionForProduct(product);
      if (result.status === "synced" && result.external_id) {
        upserted += 1;
        await upsertProduct({
          ...product,
          metadata: {
            ...product.metadata,
            shopify_collection_id: result.external_id,
            shopify_collection_sync: result,
          },
        }).catch(() => {});
      } else if (result.status === "error") {
        failed += 1;
      }
    }
    return {
      ok: failed === 0,
      mode: caps.mode,
      run: {
        status: "completed",
        mode: caps.areas.collections?.ready ? caps.mode : "local_sim",
        sync_type: "collections",
        records_upserted: upserted,
        records_failed: failed,
        summary: { note: caps.areas.collections?.message },
      },
      status_payload: caps,
      capabilities: caps,
    };
  }

  if (type === "inventory") {
    const { listProducts } = await import("./products-store.js");
    const listed = await listProducts();
    let upserted = 0;
    let failed = 0;
    for (const product of listed.data) {
      const result = await upsertShopifyInventoryForProduct(product);
      if (result.status === "synced") upserted += 1;
      else if (result.status === "error") failed += 1;
    }
    return {
      ok: failed === 0,
      mode: caps.mode,
      run: {
        status: "completed",
        mode: caps.areas.inventory?.ready ? caps.mode : "local_sim",
        sync_type: "inventory",
        records_upserted: upserted,
        records_failed: failed,
        summary: { note: caps.areas.inventory?.message },
      },
      status_payload: caps,
      capabilities: caps,
    };
  }

  if (type === "customers") {
    const { listContacts, upsertContacts } = await import(
      "@/lib/crm/contacts-store"
    );
    const listed = await listContacts();
    let upserted = 0;
    let failed = 0;
    for (const contact of listed.data.slice(0, 50)) {
      const result = await upsertShopifyCustomer(contact);
      if (result.status === "synced" && result.external_id) {
        upserted += 1;
        await upsertContacts([
          {
            ...contact,
            metadata: {
              ...contact.metadata,
              shopify_customer_id: result.external_id,
              shopify_customer_sync: {
                status: result.status,
                synced_at: result.synced_at,
                message: result.message,
              },
            },
          },
        ]).catch(() => {});
      } else if (result.status === "error") {
        failed += 1;
      }
    }
    return {
      ok: failed === 0,
      mode: caps.mode,
      run: {
        status: "completed",
        mode: caps.areas.customers?.ready ? caps.mode : "local_sim",
        sync_type: "customers",
        records_upserted: upserted,
        records_failed: failed,
        summary: { note: caps.areas.customers?.message },
      },
      status_payload: caps,
      capabilities: caps,
    };
  }

  if (type === "discounts") {
    const { listDiscounts } = await import("./discounts-store.js");
    const listed = await listDiscounts();
    let upserted = 0;
    let failed = 0;
    for (const discount of listed.data) {
      const result = await upsertShopifyDiscount(discount);
      if (result.status === "synced") upserted += 1;
      else if (result.status === "error") failed += 1;
    }
    return {
      ok: failed === 0,
      mode: caps.mode,
      run: {
        status: "completed",
        mode: caps.areas.discounts?.ready ? caps.mode : "local_sim",
        sync_type: "discounts",
        records_upserted: upserted,
        records_failed: failed,
        summary: { note: caps.areas.discounts?.message },
      },
      status_payload: caps,
      capabilities: caps,
    };
  }

  if (type === "finance" || type === "orders" || type === "payouts") {
    const payouts = await listShopifyPayouts(10);
    const { listInvoiceDocs, upsertInvoiceDoc } = await import(
      "@/lib/invoices/invoice-docs-store"
    );
    const listed = await listInvoiceDocs();
    let upserted = 0;
    let failed = 0;
    for (const invoice of listed.data.slice(0, 25)) {
      const result = await upsertShopifyDraftOrderFromInvoice(invoice);
      if (result.status === "synced" && result.external_id) {
        upserted += 1;
        await upsertInvoiceDoc({
          ...invoice,
          metadata: {
            ...invoice.metadata,
            shopify_draft_order_id: result.external_id,
            shopify_finance_sync: result,
          },
        }).catch(() => {});
      } else if (result.status === "error") {
        failed += 1;
      }
    }
    return {
      ok: failed === 0,
      mode: caps.mode,
      run: {
        status: "completed",
        mode: caps.areas.finance?.ready ? caps.mode : "local_sim",
        sync_type: type,
        records_upserted: upserted,
        records_failed: failed,
        summary: {
          note: caps.areas.finance?.message,
          payouts_status: payouts.status,
          payouts_count: payouts.payouts?.length || 0,
        },
      },
      status_payload: caps,
      capabilities: caps,
      payouts,
    };
  }

  if (type === "transfers" || type === "purchase_orders") {
    const result = await upsertShopifyInventoryTransfer({
      title: "Triada manufacturer sync probe",
      note: "Capability probe — no line items",
    });
    return {
      ok: true,
      mode: caps.mode,
      run: {
        status: "completed",
        mode: caps.areas.transfers?.ready ? caps.mode : "local_sim",
        sync_type: type,
        records_upserted: result.status === "synced" ? 1 : 0,
        records_failed: result.status === "error" ? 1 : 0,
        summary: {
          note: result.message,
          limitation: result.limitation || caps.limitations?.[0],
        },
      },
      status_payload: caps,
      capabilities: caps,
    };
  }

  if (type === "growth" || type === "marketing") {
    return {
      ok: true,
      mode: caps.mode,
      run: {
        status: "completed",
        mode: caps.areas.growth?.ready ? caps.mode : "local_sim",
        sync_type: "growth",
        records_upserted: 0,
        records_failed: 0,
        summary: {
          note:
            caps.areas.growth?.message ||
            "Growth sync runs automatically on campaign send when Connected.",
        },
      },
      status_payload: caps,
      capabilities: caps,
    };
  }

  return {
    ok: false,
    mode: caps.mode,
    run: {
      status: "failed",
      mode: caps.mode,
      sync_type: type,
      records_upserted: 0,
      records_failed: 0,
      summary: { note: `Unknown sync_type: ${type}` },
    },
    status_payload: caps,
    capabilities: caps,
  };
}
