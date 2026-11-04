/**
 * Run: node --import ./scripts/alias-hooks-register.mjs --test src/lib/commerce/product-bundles.test.js
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractProductBundle,
  filterBundleComponentCandidates,
  isBundlePriceTba,
  mergeBundleIntoMetadata,
  normalizeBundleComponents,
  shouldSyncProductToShopify,
  suggestBundleTitle,
  sumBundleComponentPrices,
} from "./product-bundles.js";

describe("normalizeBundleComponents", () => {
  it("dedupes by product_id and keeps qty", () => {
    const rows = normalizeBundleComponents([
      { product_id: "a", title: "Priest Ring", price: 100, qty: 1 },
      { id: "a", title: "dup", price: 50 },
      { product_id: "b", title: "Ephod", price: "489.5", quantity: 2 },
    ]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].title, "Priest Ring");
    assert.equal(rows[1].qty, 2);
    assert.equal(rows[1].price, 489.5);
  });
});

describe("sumBundleComponentPrices", () => {
  it("sums price × qty", () => {
    assert.equal(
      sumBundleComponentPrices([
        { product_id: "1", title: "A", price: 100, qty: 1 },
        { product_id: "2", title: "B", price: 50, qty: 2 },
      ]),
      200,
    );
  });

  it("returns null when no priced parts", () => {
    assert.equal(
      sumBundleComponentPrices([{ product_id: "1", title: "A", price: null }]),
      null,
    );
  });
});

describe("suggestBundleTitle", () => {
  it("joins component titles", () => {
    assert.equal(
      suggestBundleTitle([
        { product_id: "1", title: "Priest Ring Men" },
        { product_id: "2", title: "Ephod necklace" },
      ]),
      "Priest Ring Men + Ephod necklace",
    );
  });
});

describe("mergeBundleIntoMetadata / extractProductBundle", () => {
  it("persists components and sum", () => {
    const meta = mergeBundleIntoMetadata(
      { collection: "Bundles" },
      {
        is_bundle: true,
        components: [
          { product_id: "p1", title: "Priest Ring", price: 1200 },
          { product_id: "p2", title: "Ephod necklace", price: 800 },
        ],
        metal_variants: [
          { metal: "Silver", price: 589 },
          { metal: "Gold", price: 3699 },
        ],
        price_tba: false,
      },
    );
    assert.equal(meta.is_bundle, true);
    assert.equal(meta.components_sum, 2000);
    assert.equal(meta.bundle.metal_variants.length, 2);
    const extracted = extractProductBundle({ metadata: meta });
    assert.equal(extracted?.is_bundle, true);
    assert.equal(extracted?.components.length, 2);
  });

  it("clears bundle when mode off", () => {
    const meta = mergeBundleIntoMetadata(
      {
        is_bundle: true,
        components: [{ product_id: "x", title: "X", price: 1 }],
        bundle: { is_bundle: true },
      },
      { is_bundle: false },
    );
    assert.equal(meta.is_bundle, undefined);
    assert.equal(meta.bundle, undefined);
  });
});

describe("TBA sync gate", () => {
  it("blocks Shopify for draft bundles without price", () => {
    const product = {
      price: null,
      published_status: "draft",
      metadata: {
        is_bundle: true,
        components: [{ product_id: "1", title: "Stone Set", price: 400 }],
        price_tba: true,
      },
    };
    assert.equal(isBundlePriceTba(product), true);
    assert.equal(shouldSyncProductToShopify(product), false);
  });

  it("allows sync when priced", () => {
    const product = {
      price: 589,
      published_status: "published",
      metadata: {
        is_bundle: true,
        components: [{ product_id: "1", title: "A", price: 700 }],
      },
    };
    assert.equal(shouldSyncProductToShopify(product), true);
  });

  it("allows sync when metal variants are priced even if base price empty", () => {
    const product = {
      price: null,
      published_status: "draft",
      metadata: {
        is_bundle: true,
        metal_variants: [
          { metal: "Silver", price: 589 },
          { metal: "Gold", price: 3699 },
        ],
      },
    };
    assert.equal(isBundlePriceTba(product), false);
    assert.equal(shouldSyncProductToShopify(product), true);
  });
});

describe("filterBundleComponentCandidates", () => {
  it("excludes self and other bundles", () => {
    const products = [
      { id: "self", title: "Self" },
      { id: "a", title: "Priest Ring Men", sku: "TD-1" },
      {
        id: "b",
        title: "Other Bundle",
        metadata: { is_bundle: true, components: [{ product_id: "a" }] },
      },
      { id: "c", title: "Ephod necklace" },
    ];
    const rows = filterBundleComponentCandidates(products, {
      excludeId: "self",
      q: "ephod",
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, "c");
  });
});
