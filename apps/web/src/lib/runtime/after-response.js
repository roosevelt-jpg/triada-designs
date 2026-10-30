/**
 * Schedule work after the HTTP response is sent.
 * Uses Next.js `after()` when available so Vercel keeps the isolate alive
 * for Graph / Bot / Resend outbound without blocking the webhook 200.
 *
 * Smoke scripts (no request context): falls back to detached microtasks and
 * tracks promises for `flushAfterResponse()`.
 */

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** @type {Set<Promise<unknown>>} */
const pending = new Set();

/**
 * Cached Next `after` — undefined until first resolve, then function|null.
 * @type {((task: () => void | Promise<void>) => void) | null | undefined}
 */
let cachedAfter = undefined;

/**
 * @returns {((task: () => void | Promise<void>) => void) | null}
 */
function resolveAfter() {
  if (cachedAfter !== undefined) return cachedAfter;
  if (process.env.TRIADA_FORCE_DETACHED_AFTER === "1") {
    cachedAfter = null;
    return null;
  }
  try {
    const mod = require("next/server");
    cachedAfter = typeof mod.after === "function" ? mod.after : null;
  } catch {
    cachedAfter = null;
  }
  return cachedAfter;
}

/**
 * @param {() => (void | Promise<void>)} task
 * @returns {{ mode: string, promise: Promise<unknown> }}
 */
export function runAfterResponse(task) {
  /** @type {(value?: unknown) => void} */
  let settle = () => {};
  const promise = new Promise((resolve) => {
    settle = resolve;
  });

  const run = () =>
    Promise.resolve()
      .then(task)
      .then((value) => settle(value))
      .catch((err) => {
        console.error(
          "[after-response]",
          String(err && /** @type {any} */ (err).message ? err.message : err),
        );
        settle(undefined);
      });

  pending.add(promise);
  promise.finally(() => pending.delete(promise));

  const afterFn = resolveAfter();
  if (typeof afterFn === "function") {
    try {
      afterFn(run);
      return { mode: "next_after", promise };
    } catch {
      // Called outside a Next request scope — fall through to detached.
    }
  }

  // Outside Next request: defer one tick so the caller can return first.
  queueMicrotask(run);
  return { mode: "detached", promise };
}

/**
 * Await all in-flight background tasks (smoke / tests).
 */
export async function flushAfterResponse() {
  while (pending.size) {
    await Promise.allSettled([...pending]);
  }
}

/**
 * @returns {number}
 */
export function pendingAfterResponseCount() {
  return pending.size;
}
