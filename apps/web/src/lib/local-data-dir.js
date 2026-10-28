/**
 * Writable local persistence dir for Next dual-run fallbacks.
 *
 * Vercel / Lambda filesystems are read-only outside /tmp. Prefer:
 *   1. TRIADA_LOCAL_DIR override
 *   2. process.env.TMPDIR (or /tmp) + /triada-local on serverless
 *   3. cwd/.triada-local for local dev
 */

import path from "node:path";

function serverlessTmpRoot() {
  const fromEnv = process.env.TMPDIR || process.env.TEMP || process.env.TMP;
  if (fromEnv && String(fromEnv).trim()) {
    return String(fromEnv).replace(/\/$/, "");
  }
  return "/tmp";
}

/**
 * @returns {string}
 */
export function getLocalDataDir() {
  if (process.env.TRIADA_LOCAL_DIR) {
    return process.env.TRIADA_LOCAL_DIR;
  }
  if (
    process.env.VERCEL ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.LAMBDA_TASK_ROOT
  ) {
    return path.join(serverlessTmpRoot(), "triada-local");
  }
  return path.join(process.cwd(), ".triada-local");
}
