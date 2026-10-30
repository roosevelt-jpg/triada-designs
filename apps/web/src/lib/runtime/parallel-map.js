/**
 * Run an async mapper over items with bounded concurrency.
 * Used for multi-message webhook payloads and campaign / fan-out recipient loops.
 *
 * @template T
 * @template R
 * @param {T[]} items
 * @param {(item: T, index: number) => Promise<R>} fn
 * @param {{ concurrency?: number }} [opts]
 * @returns {Promise<R[]>}
 */
export async function mapParallel(items, fn, opts = {}) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return [];

  const concurrency = Math.max(
    1,
    Math.min(Number(opts.concurrency) || 8, list.length),
  );
  /** @type {R[]} */
  const results = new Array(list.length);
  let next = 0;

  async function worker() {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= list.length) return;
      results[index] = await fn(list[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: concurrency }, () => worker()),
  );
  return results;
}
