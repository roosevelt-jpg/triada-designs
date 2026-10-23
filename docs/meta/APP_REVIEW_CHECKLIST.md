# Meta App Review checklist (Triada)

Use this when moving from local simulator → live Graph / WhatsApp Cloud.

## One-time Meta Developer setup

1. Create a Meta Developer App (Business type).
2. Add products: **Messenger**, **Instagram**, **WhatsApp** (as needed).
3. Set webhook callback URL to Triada API:
   - `https://<api-host>/api/webhooks/meta`
   - WhatsApp: `https://<api-host>/api/webhooks/whatsapp`
4. Verify token must match Triada (`META_VERIFY_TOKEN` or rotated workspace token from Meta hub).
5. Subscribe fields: `messages`, `messaging_postbacks`, `message_deliveries` (adjust per product).
6. Complete App Review permissions required for your use case (e.g. `pages_messaging`, `instagram_manage_messages`, WhatsApp messaging).

## Triada-side (day-to-day after connect)

1. Ops → **Integrations → Meta messaging**.
2. Paste Page / IG / WhatsApp tokens (stored encrypted).
3. Subscribe webhook flag from Triada UI.
4. Test send + local simulator until `INTEGRATION_MODE=live`.
5. Manage automations, pauses, and inbox takeover in Triada — not Meta Business Suite for routine ops.

## Signed payload validation

- Production: set `META_WEBHOOK_SECRET` or `META_APP_SECRET`.
- Webhooks validate `X-Hub-Signature-256` (HMAC SHA-256).
- Local mode accepts unsigned payloads for simulator only.

## Honesty rules

- Status remains `awaiting_credentials` / `local` / `disconnected` until live tokens + `INTEGRATION_MODE=live`.
- Never mark Meta channels healthy without a successful live Graph probe.
