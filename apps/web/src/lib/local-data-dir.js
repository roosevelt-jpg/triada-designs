/**
 * Writable local persistence dir for Next dual-run fallbacks.
 * On Vercel the app filesystem is read-only — use /tmp.
 */

import path from "node:path";
import os from "node:os";

/**
 * @returns {string}
 */
export function getLocalDataDir() {
  if (process.env.TRIADA_LOCAL_DIR) {
    return process.env.TRIADA_LOCAL_DIR;
  }
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return path.join(os.tmpdir(), "triada-local");
  }
  return path.join(process.cwd(), ".triada-local");
}
