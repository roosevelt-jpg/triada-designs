/**
 * Run: node --test src/lib/public-app-url.test.js
 */

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  PRODUCTION_APP_URL,
  isAllowedProductionAppHost,
  isEphemeralOrTunnelHost,
  resolvePublicAppUrl,
  sanitizePublicAppUrl,
  absoluteAppUrl,
} from "./public-app-url.js";

const ENV_KEYS = [
  "NEXT_PUBLIC_APP_URL",
  "OPS_APP_URL",
  "FRONTEND_URL",
  "APP_URL",
  "VERCEL_URL",
];

const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("isEphemeralOrTunnelHost", () => {
  it("flags trycloudflare and vercel previews", () => {
    assert.equal(isEphemeralOrTunnelHost("abc.trycloudflare.com"), true);
    assert.equal(isEphemeralOrTunnelHost("triada-ops.vercel.app"), true);
    assert.equal(isEphemeralOrTunnelHost("localhost"), true);
  });
});

describe("isAllowedProductionAppHost", () => {
  it("allows dashboard and rejects api / tunnels", () => {
    assert.equal(isAllowedProductionAppHost("dashboard.triada-designs.com"), true);
    assert.equal(isAllowedProductionAppHost("api.triada-designs.com"), false);
    assert.equal(isAllowedProductionAppHost("foo.trycloudflare.com"), false);
  });
});

describe("resolvePublicAppUrl", () => {
  it("defaults to https://dashboard.triada-designs.com", () => {
    for (const key of ENV_KEYS) delete process.env[key];
    assert.equal(resolvePublicAppUrl(), PRODUCTION_APP_URL);
  });

  it("ignores trycloudflare and VERCEL_URL", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://x.trycloudflare.com";
    process.env.APP_URL = "https://y.trycloudflare.com";
    process.env.VERCEL_URL = "triada-ops.vercel.app";
    assert.equal(resolvePublicAppUrl(), PRODUCTION_APP_URL);
  });

  it("ignores request Host when it is a tunnel", () => {
    for (const key of ENV_KEYS) delete process.env[key];
    const request = {
      headers: {
        get(name) {
          if (name === "host" || name === "x-forwarded-host") {
            return "lively.trycloudflare.com";
          }
          return null;
        },
      },
    };
    assert.equal(resolvePublicAppUrl({ request }), PRODUCTION_APP_URL);
  });

  it("builds invite-style absolute paths on the dashboard", () => {
    for (const key of ENV_KEYS) delete process.env[key];
    assert.equal(
      absoluteAppUrl("/invite/tok"),
      "https://dashboard.triada-designs.com/invite/tok",
    );
  });

  it("sanitizes dashboard env", () => {
    assert.equal(
      sanitizePublicAppUrl("https://dashboard.triada-designs.com/"),
      "https://dashboard.triada-designs.com",
    );
  });
});
