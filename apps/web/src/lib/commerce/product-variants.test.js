import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  expandVariantMatrix,
  extractProductStockVariants,
  hasSizeColorOptions,
  mergeStockVariantsIntoMetadata,
  normalizeOptionValues,
  normalizeStockVariants,
  sumVariantInventory,
  toShopifySizeColorVariantRows,
  variantOptionKey,
} from "./product-variants.js";

describe("product-variants", () => {
  it("normalizes option lists without duplicates", () => {
    assert.deepEqual(normalizeOptionValues("EU 54, EU 56, eu 54\nUS 7"), [
      "EU 54",
      "EU 56",
      "US 7",
    ]);
  });

  it("expands size × color matrix and keeps prior qty", () => {
    const rows = expandVariantMatrix({
      sizes: ["54", "56"],
      colors: ["Gold", "Silver"],
      existing: [{ size: "54", color: "Gold", inventory_quantity: 3 }],
    });
    assert.equal(rows.length, 4);
    const match = rows.find((r) => r.size === "54" && r.color === "Gold");
    assert.equal(match?.inventory_quantity, 3);
  });

  it("merges variants into metadata and sums inventory", () => {
    const meta = mergeStockVariantsIntoMetadata(
      {},
      {
        sizes: ["54", "56"],
        colors: ["Gold"],
        variants: [
          { size: "54", color: "Gold", inventory_quantity: 2 },
          { size: "56", color: "Gold", inventory_quantity: 5 },
        ],
      },
    );
    assert.equal(meta.inventory_quantity, 7);
    assert.equal(/** @type {unknown[]} */ (meta.stock_variants).length, 2);
    assert.equal(sumVariantInventory(meta.stock_variants), 7);
  });

  it("extracts stock variants from product metadata", () => {
    const rows = extractProductStockVariants({
      metadata: {
        stock_variants: [{ size: "54", color: "Rose", inventory_quantity: 1 }],
      },
    });
    assert.equal(rows.length, 1);
    assert.equal(hasSizeColorOptions(rows), true);
  });

  it("builds Shopify Size/Color option rows", () => {
    const built = toShopifySizeColorVariantRows({
      product: { sku: "TD-RING", price: 120 },
      variants: [
        { size: "54", color: "Gold", inventory_quantity: 2 },
        { size: "56", color: "Gold", inventory_quantity: 0 },
      ],
      variantIdsByKey: {
        [variantOptionKey("54", "Gold")]: 99,
      },
    });
    assert.deepEqual(
      built.options.map((o) => o.name),
      ["Size", "Color"],
    );
    assert.equal(built.variants.length, 2);
    assert.equal(built.variants[0].id, 99);
    assert.equal(built.variants[0].inventory_management, "shopify");
    assert.equal(built.variants[0].option1, "54");
    assert.equal(built.variants[0].option2, "Gold");
  });

  it("normalizes empty / junk rows away", () => {
    assert.deepEqual(normalizeStockVariants([{ size: "", color: "" }, null]), []);
  });
});
