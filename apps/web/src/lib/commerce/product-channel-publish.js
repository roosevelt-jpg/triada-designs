/**
 * Publish / sync a Triada catalog product to Shopify + WordPress.
 * When credentials are missing, channel rows stay clear `awaiting_credentials`.
 */

import {
  getProduct,
  listProducts,
  shapeProduct,
  updateProductChannelSync,
  upsertProduct,
} from "./products-store.js";
import { mergeSpecsIntoMetadata } from "./product-specs.js";
import {
  getShopifyRuntime,
  listShopifyRemoteProducts,
  upsertShopifyProduct,
} from "./shopify-admin.js";
import {
  upsertWordpressProductPost,
  wordpressRuntime,
} from "./wordpress-products.js";

/**
 * @param {import("./products-store.js").ProductRecord} product
 * @param {{ channels?: Array<'shopify'|'wordpress'|'all'>, mark_published?: boolean }} [opts]
 */
export async function publishProductToChannels(product, opts = {}) {
  const channels = opts.channels || ["all"];
  const wantAll = channels.includes("all");
  const wantShopify = wantAll || channels.includes("shopify");
  const wantWordpress = wantAll || channels.includes("wordpress");

  let working = product;
  if (opts.mark_published && working.published_status !== "published") {
    const saved = await upsertProduct({
      ...working,
      published_status: "published",
    });
    working = saved.product;
  }

  /** @type {Partial<{ shopify: import("./products-store.js").ChannelSyncState, wordpress: import("./products-store.js").ChannelSyncState }>} */
  const syncPatch = {};

  if (wantShopify) {
    syncPatch.shopify = await upsertShopifyProduct(working);
  }
  if (wantWordpress) {
    syncPatch.wordpress = await upsertWordpressProductPost(working);
  }

  const updated = await updateProductChannelSync(working.id, syncPatch);
  if (!updated.ok) {
    return {
      ok: false,
      error: updated.error || "Failed to save channel sync",
      product: working,
      channels: syncPatch,
    };
  }

  const shopify = updated.product.channel_sync.shopify;
  const wordpress = updated.product.channel_sync.wordpress;
  const anyError =
    (wantShopify && shopify.status === "error") ||
    (wantWordpress && wordpress.status === "error");
  const anyAwaiting =
    (wantShopify && shopify.status === "awaiting_credentials") ||
    (wantWordpress && wordpress.status === "awaiting_credentials");

  return {
    ok: !anyError,
    awaiting_credentials: anyAwaiting,
    product: updated.product,
    channels: {
      shopify: wantShopify ? shopify : undefined,
      wordpress: wantWordpress ? wordpress : undefined,
    },
    shopify_runtime: await getShopifyRuntime(),
    wordpress_runtime: wordpressRuntime(),
    summary: buildSummary({
      shopify: wantShopify ? shopify : null,
      wordpress: wantWordpress ? wordpress : null,
    }),
  };
}

/**
 * Create or update a product, then sync channels.
 * When Shopify is Connected, every add/edit pushes price + specs to Shopify.
 * WordPress still follows the explicit publish flag (or channels override).
 * @param {Record<string, unknown>} input
 * @param {{ publish?: boolean, channels?: Array<'shopify'|'wordpress'|'all'> }} [opts]
 */
export async function saveAndMaybePublishProduct(input, opts = {}) {
  const title = String(input.title || "").trim();
  if (!title) {
    return { ok: false, error: "title is required", status: 422 };
  }

  const saved = await upsertProduct(input);
  const explicitPublish =
    opts.publish === true ||
    String(input.publish || "").toLowerCase() === "true" ||
    String(input.published_status || "").toLowerCase() === "published";

  const shopifyRuntimeLive = await getShopifyRuntime();
  const shopifyReady = shopifyRuntimeLive.ready;
  const wpReady = wordpressRuntime().ready;

  /** @type {Array<'shopify'|'wordpress'>} */
  let channels = [];
  if (Array.isArray(opts.channels) && opts.channels.length && !opts.channels.includes("all")) {
    channels = opts.channels.filter(
      (c) => c === "shopify" || c === "wordpress",
    );
  } else if (Array.isArray(input.channels) && input.channels.length && !input.channels.includes("all")) {
    channels = /** @type {Array<'shopify'|'wordpress'>} */ (
      input.channels.filter((c) => c === "shopify" || c === "wordpress")
    );
  } else {
    // Default: Shopify auto-syncs whenever Connected; WordPress on publish.
    if (shopifyReady || explicitPublish) channels.push("shopify");
    if (explicitPublish) channels.push("wordpress");
  }

  // Always attempt Shopify on save when Connected (even if caller omitted it).
  if (shopifyReady && !channels.includes("shopify")) {
    channels.push("shopify");
  }

  if (!channels.length) {
    const stamped = await updateProductChannelSync(saved.product.id, {
      shopify: saved.product.channel_sync.shopify.external_id
        ? saved.product.channel_sync.shopify
        : {
            status: shopifyReady ? "pending_publish" : "awaiting_credentials",
            external_id: null,
            link: null,
            synced_at: null,
            mode: shopifyReady ? shopifyRuntimeLive.mode : "local",
            message: shopifyReady
              ? "Saved. Publish to push to Shopify."
              : "Waiting credentials.",
          },
      wordpress: saved.product.channel_sync.wordpress.external_id
        ? saved.product.channel_sync.wordpress
        : {
            status: wpReady ? "pending_publish" : "awaiting_credentials",
            external_id: null,
            link: null,
            synced_at: null,
            mode: wpReady ? wordpressRuntime().mode : "local",
            message: wpReady
              ? "Saved. Publish to push to WordPress."
              : "Waiting credentials.",
          },
    });
    return {
      ok: true,
      created: saved.created,
      published: false,
      shopify_auto_synced: false,
      product: stamped.ok ? stamped.product : saved.product,
      mode: saved.mode,
    };
  }

  const published = await publishProductToChannels(saved.product, {
    channels,
    mark_published: explicitPublish,
  });

  return {
    ok: published.ok,
    created: saved.created,
    published: explicitPublish,
    shopify_auto_synced: channels.includes("shopify") && shopifyReady,
    awaiting_credentials: published.awaiting_credentials,
    product: published.product,
    channels: published.channels,
    summary: published.summary,
    mode: saved.mode,
    error: published.ok ? undefined : published.error,
  };
}

/**
 * Publish an existing product by id.
 * @param {string} id
 * @param {{ channels?: Array<'shopify'|'wordpress'|'all'> }} [opts]
 */
export async function publishProductById(id, opts = {}) {
  const product = await getProduct(id);
  if (!product) {
    return { ok: false, error: "Product not found", status: 404 };
  }
  return publishProductToChannels(product, {
    channels: opts.channels || ["all"],
    mark_published: true,
  });
}

/**
 * Pull Shopify catalog into local store (inbound sync) + report channel readiness.
 */
export async function syncShopifyCatalogInbound() {
  const remote = await listShopifyRemoteProducts(50);
  const runtime = await getShopifyRuntime();

  if (remote.status === "awaiting_credentials") {
    return {
      ok: true,
      mode: "local_sim",
      status: "awaiting_credentials",
      run: {
        status: "completed",
        mode: "local_sim",
        sync_type: "products",
        records_upserted: 0,
        records_failed: 0,
        summary: {
          note: remote.message,
          products_seen: remote.products.length,
        },
      },
      status_payload: {
        ...runtime,
        connected: false,
        has_access_token: false,
        status: "awaiting_credentials",
        status_label: "Waiting credentials",
      },
    };
  }

  let upserted = 0;
  let failed = 0;
  for (const remoteProduct of remote.products) {
    try {
      const variant = Array.isArray(remoteProduct.variants)
        ? remoteProduct.variants[0] || {}
        : {};
      const externalId = String(remoteProduct.id);
      const listed = await listProducts();
      const existing = listed.data.find(
        (p) => p.channel_sync?.shopify?.external_id === externalId,
      );

      const weight =
        variant.weight != null && Number.isFinite(Number(variant.weight))
          ? Number(variant.weight)
          : null;
      const weightUnit = String(variant.weight_unit || "g").toLowerCase();
      const weightGrams =
        weight == null
          ? null
          : weightUnit === "kg"
            ? weight * 1000
            : weightUnit === "oz"
              ? weight * 28.3495
              : weightUnit === "lb"
                ? weight * 453.592
                : weight;

      const currencyFromTags = parseCurrencyTag(remoteProduct.tags);
      const metadata = mergeSpecsIntoMetadata(existing?.metadata || {}, {
        category: remoteProduct.product_type
          ? String(remoteProduct.product_type)
          : existing?.metadata?.category,
        weight_grams: weightGrams,
        compare_at_price:
          variant.compare_at_price != null
            ? Number(variant.compare_at_price)
            : undefined,
        barcode: variant.barcode ? String(variant.barcode) : undefined,
        photo_url: Array.isArray(remoteProduct.images) && remoteProduct.images[0]?.src
          ? String(remoteProduct.images[0].src)
          : undefined,
      });

      await upsertProduct(
        shapeProduct({
          ...(existing || {}),
          id: existing?.id,
          title: String(remoteProduct.title || existing?.title || "Untitled"),
          description: stripHtml(String(remoteProduct.body_html || "")),
          sku: variant.sku ? String(variant.sku) : existing?.sku || null,
          price: variant.price != null ? Number(variant.price) : existing?.price,
          currency: currencyFromTags || existing?.currency || "AED",
          availability_status:
            Number(variant.inventory_quantity ?? 1) <= 0
              ? "out_of_stock"
              : "in_stock_snapshot",
          published_status:
            remoteProduct.status === "active" ? "published" : "draft",
          metadata,
          channel_sync: {
            shopify: {
              status: "synced",
              external_id: externalId,
              link: remoteProduct.handle
                ? `https://${runtime.shop_domain}/products/${remoteProduct.handle}`
                : null,
              synced_at: new Date().toISOString(),
              mode: remote.mode,
              message: "Pulled from Shopify Admin API.",
            },
            wordpress: existing?.channel_sync?.wordpress,
          },
        }),
      );
      upserted += 1;
    } catch {
      failed += 1;
    }
  }

  return {
    ok: remote.status !== "error",
    mode: remote.mode,
    status: remote.status,
    run: {
      status: remote.status === "error" ? "failed" : "completed",
      mode: remote.mode,
      sync_type: "products",
      records_upserted: upserted,
      records_failed: failed,
      summary: {
        products_seen: remote.products.length,
        message: remote.message,
      },
      error_message: remote.status === "error" ? remote.message : null,
    },
    status_payload: {
      connected: runtime.ready,
      has_access_token: runtime.ready,
      store: runtime.shop_domain,
      shop_domain: runtime.shop_domain,
      status: runtime.ready ? "connected" : "awaiting_credentials",
      status_label: runtime.ready ? "Connected" : "Waiting credentials",
      mode: runtime.mode,
      summary: runtime.message,
      product_count: (await listProducts()).data.length,
    },
  };
}

/** @param {{ shopify: import("./products-store.js").ChannelSyncState | null, wordpress: import("./products-store.js").ChannelSyncState | null }} channels */
function buildSummary(channels) {
  const parts = [];
  if (channels.shopify) {
    parts.push(`Shopify: ${channels.shopify.status}`);
  }
  if (channels.wordpress) {
    parts.push(`WordPress: ${channels.wordpress.status}`);
  }
  return parts.join(" · ") || "No channels selected";
}

/** @param {string} html */
function stripHtml(html) {
  return String(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** @param {unknown} tags */
function parseCurrencyTag(tags) {
  const raw = Array.isArray(tags)
    ? tags.join(",")
    : tags != null
      ? String(tags)
      : "";
  const match = raw.match(/(?:^|,\s*)currency:([A-Za-z]{3})(?:\s*,|$)/i);
  return match ? match[1].toUpperCase() : null;
}
