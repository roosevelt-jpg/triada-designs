/**
 * Run: node --import ./scripts/alias-hooks-register.mjs --test src/lib/commerce/product-specs.test.js
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  absoluteProductPhotoUrlForShopify,
  absoluteProductPhotoUrlsForShopify,
  extractProductSpecs,
  generateProductSku,
  isSalePrice,
  mergeSpecsIntoMetadata,
  normalizeProductMediaUrl,
  normalizeProductMediaUrlList,
  productPhotoUrl,
  productPhotoUrls,
  shopifyRemoteImageSrc,
  shopifyRemoteImageSrcs,
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

describe("shopifyRemoteImageSrc(s)", () => {
  it("reads images[0].src", () => {
    assert.equal(
      shopifyRemoteImageSrc({
        images: [{ src: "https://cdn.shopify.com/s/files/1/a.jpg" }],
      }),
      "https://cdn.shopify.com/s/files/1/a.jpg",
    );
  });

  it("returns all image srcs in order", () => {
    assert.deepEqual(
      shopifyRemoteImageSrcs({
        images: [
          { src: "https://cdn.shopify.com/a.jpg" },
          { src: "//cdn.shopify.com/b.jpg" },
          { src: "https://cdn.shopify.com/a.jpg?v=2" },
        ],
      }),
      [
        "https://cdn.shopify.com/a.jpg",
        "https://cdn.shopify.com/b.jpg",
      ],
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

describe("productPhotoUrl(s) / extractProductSpecs", () => {
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

  it("merges photo_urls array with primary photo_url", () => {
    const specs = extractProductSpecs({
      metadata: {
        photo_url: "https://cdn.shopify.com/cover.jpg",
        photo_urls: [
          "https://cdn.shopify.com/cover.jpg",
          "https://cdn.shopify.com/side.jpg",
        ],
      },
    });
    assert.deepEqual(specs.photo_urls, [
      "https://cdn.shopify.com/cover.jpg",
      "https://cdn.shopify.com/side.jpg",
    ]);
    assert.equal(specs.photo_url, "https://cdn.shopify.com/cover.jpg");
    assert.deepEqual(
      productPhotoUrls({
        metadata: {
          photo_urls: ["/a.jpg", "/b.jpg"],
        },
      }),
      ["/a.jpg", "/b.jpg"],
    );
  });

  it("persists photo_urls via mergeSpecsIntoMetadata", () => {
    const meta = mergeSpecsIntoMetadata(
      {},
      {
        photo_urls: [
          "https://cdn.shopify.com/a.jpg",
          "https://cdn.shopify.com/b.jpg",
        ],
      },
    );
    assert.deepEqual(meta.photo_urls, [
      "https://cdn.shopify.com/a.jpg",
      "https://cdn.shopify.com/b.jpg",
    ]);
    assert.equal(meta.photo_url, "https://cdn.shopify.com/a.jpg");
    assert.deepEqual(meta.specs.photo_urls, meta.photo_urls);
  });
});

describe("absoluteProductPhotoUrl(s)ForShopify", () => {
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

  it("returns all absolute photos for Shopify", () => {
    const urls = absoluteProductPhotoUrlsForShopify({
      metadata: {
        photo_urls: [
          "https://cdn.shopify.com/a.jpg",
          "/brand/jewellery/b.jpg",
          "data:image/png;base64,abc",
        ],
      },
    });
    assert.equal(urls.length, 2);
    assert.equal(urls[0], "https://cdn.shopify.com/a.jpg");
    assert.match(urls[1], /\/brand\/jewellery\/b\.jpg$/);
  });
});

describe("generateProductSku", () => {
  it("keeps an existing SKU", () => {
    assert.equal(
      generateProductSku({ title: "Priest Ring", sku: "TD-RING-PRIEST-01" }),
      "TD-RING-PRIEST-01",
    );
  });

  it("builds TD-{TITLE}-{suffix} when empty", () => {
    const sku = generateProductSku({
      title: "The Priest Ring",
      id: "prod-abcd",
      sku: "",
    });
    assert.match(sku, /^TD-THE-PRIEST-RING-[A-Z0-9]{4}$/);
  });

  it("falls back to ITEM when title blank", () => {
    const sku = generateProductSku({ title: "", id: "xyz1" });
    assert.match(sku, /^TD-ITEM-[A-Z0-9]{4}$/);
  });
});

describe("isSalePrice", () => {
  it("true only when compare-at is higher than price", () => {
    assert.equal(isSalePrice(100, 150), true);
    assert.equal(isSalePrice(150, 100), false);
    assert.equal(isSalePrice(100, 100), false);
    assert.equal(isSalePrice(100, null), false);
  });
});

describe("normalizeProductMediaUrlList", () => {
  it("dedupes by path ignoring query", () => {
    assert.deepEqual(
      normalizeProductMediaUrlList([
        "https://cdn.shopify.com/a.jpg?v=1",
        "https://cdn.shopify.com/a.jpg?v=2",
        "https://cdn.shopify.com/b.jpg",
      ]),
      ["https://cdn.shopify.com/a.jpg?v=1", "https://cdn.shopify.com/b.jpg"],
    );
  });
});
