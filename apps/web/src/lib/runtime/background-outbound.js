/**
 * Deliver a provider outbound send off the inbound HTTP critical path.
 * Draft / handoff text stays sync; Graph / Bot / Resend run via after().
 */

import { runAfterResponse } from "@/lib/runtime/after-response";

/**
 * @param {{
 *   background?: boolean,
 *   send: () => Promise<Record<string, unknown>>,
 *   afterSend?: (send: Record<string, unknown>) => Promise<unknown>,
 * }} input
 * @returns {Promise<{
 *   send: Record<string, unknown> | null,
 *   saved: unknown,
 *   send_pending: boolean,
 * }>}
 */
export async function deliverOutbound(input) {
  const background = input.background === true;

  if (!background) {
    const send = await input.send();
    const saved = input.afterSend ? await input.afterSend(send) : null;
    return { send, saved, send_pending: false };
  }

  runAfterResponse(async () => {
    const send = await input.send();
    if (input.afterSend) await input.afterSend(send);
  });

  return {
    send: {
      ok: true,
      mode: "background",
      pending: true,
    },
    saved: null,
    send_pending: true,
  };
}
