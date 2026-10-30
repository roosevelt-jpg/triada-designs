/**
 * Run: node --import ./scripts/alias-hooks-register.mjs --test src/lib/commerce/product-specs.test.js
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  absoluteProductPhotoUrlForShopify,
  extractProductSpecs,
  normalizeProductMediaUrl,
  productPhotoUrl,
  shopifyRemoteImageSrc,
} from "./product-specs.js";

describe("normalizeProductMediaUrl", () => {
  it("upgrades protocol-relative Shopify CDN", () => {
    assert.equal(
      normalizeProductMediaUrl("//cdn.shopify.com/s/files/1/x/products/a.jpg"),
      "https://cdn.shopify.com/s/files/1/x/products/a.jpg",
    );
  });

  it("keeps https and relative paths", () => {
    assert.equal(
      normalizeProductMediaUrl("https://cdn.shopify.com/a.jpg"),
      "https://cdn.shopify.com/a.jpg",
    );
    assert.equal(
      normalizeProductMediaUrl("/brand/jewellery/priest-ring.jpg"),
      "/brand/jewellery/priest-ring.jpg",
    );
  });

  it("returns null for empty", () => {
    assert.equal(normalizeProductMediaUrl(""), null);
    assert.equal(normalizeProductMediaUrl(null), null);
  });
});

describe("shopifyRemoteImageSrc", () => {
  it("reads images[0].src", () => {
    assert.equal(
      shopifyRemoteImageSrc({
        images: [{ src: "https://cdn.shopify.com/s/files/1/a.jpg" }],
      }),
      "https://cdn.shopify.com/s/files/1/a.jpg",
    );
  });

  it("falls back to featured image.src", () => {
    assert.equal(
      shopifyRemoteImageSrc({
        image: { src: "//cdn.shopify.com/s/files/1/b.jpg" },
      }),
      "https://cdn.shopify.com/s/files/1/b.jpg",
    );
  });
});

describe("productPhotoUrl / extractProductSpecs", () => {
  it("reads metadata.photo_url and nested specs", () => {
    assert.equal(
      productPhotoUrl({
        metadata: { photo_url: "https://cdn.shopify.com/a.jpg" },
      }),
      "https://cdn.shopify.com/a.jpg",
    );
    assert.equal(
      productPhotoUrl({
        metadata: { specs: { photo_url: "/brand/jewellery/a.jpg" } },
      }),
      "/brand/jewellery/a.jpg",
    );
    assert.equal(
      extractProductSpecs({
        metadata: { image_url: "//cdn.shopify.com/c.jpg" },
      }).photo_url,
      "https://cdn.shopify.com/c.jpg",
    );
  });
});

describe("absoluteProductPhotoUrlForShopify", () => {
  it("returns https unchanged and skips data URLs", () => {
    assert.equal(
      absoluteProductPhotoUrlForShopify({
        metadata: { photo_url: "https://cdn.shopify.com/a.jpg" },
      }),
      "https://cdn.shopify.com/a.jpg",
    );
    assert.equal(
      absoluteProductPhotoUrlForShopify({
        metadata: { photo_url: "data:image/png;base64,abc" },
      }),
      null,
    );
  });

  it("absolutizes relative brand paths", () => {
    const abs = absoluteProductPhotoUrlForShopify({
      metadata: { photo_url: "/brand/jewellery/priest-ring.jpg" },
    });
    assert.match(abs, /^https:\/\//);
    assert.match(abs, /\/brand\/jewellery\/priest-ring\.jpg$/);
  });
});
