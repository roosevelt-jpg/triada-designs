# Integrations

## Modes

| Mode | Behavior |
|---|---|
| `local` (default) | Clients return seeded fixture data; webhooks accept when secret unset |
| `mock` | Alias for `local` (legacy env value) |
| `live` | Real HTTP calls; requires credentials |

Set `INTEGRATION_MODE` in `apps/api/.env`.

User-facing status language: **local / seeded / live / disconnected / error**. Do not present disconnected providers (e.g. Shopify) as healthy.

## WordPress

**Client:** `App\Services\WordPress\WordPressClient`

**Capabilities**

- Health check
- List published posts (knowledge source)
- Create draft posts
- Webhook ingest with idempotent `provider_event_id`

**Env**

```bash
WORDPRESS_BASE_URL=
WORDPRESS_USERNAME=
WORDPRESS_APPLICATION_PASSWORD=
WORDPRESS_WEBHOOK_SECRET=
```

**Routes**

- `GET /api/v1/integrations/wordpress/posts`
- `POST /api/v1/integrations/wordpress/drafts`
- `POST /api/webhooks/wordpress`

## Zoho CRM

**Client:** `App\Services\CRM\Zoho\ZohoCrmClient` implementing `CrmClientInterface`

**Capabilities**

- Health check
- Upsert contact / lead
- List recent leads
- Webhook ingest with deduplication

**Env**

```bash
ZOHO_CLIENT_ID=
ZOHO_CLIENT_SECRET=
ZOHO_REFRESH_TOKEN=
ZOHO_ACCESS_TOKEN=
ZOHO_API_DOMAIN=https://www.zohoapis.com
ZOHO_ACCOUNTS_URL=https://accounts.zoho.com
ZOHO_WEBHOOK_SECRET=
```

**Routes**

- `POST /api/v1/contacts` (optional `sync_to_zoho`)
- `POST /api/v1/leads/{id}/sync-zoho`
- `POST /api/webhooks/zoho`
- `GET /api/v1/integrations/health`

## Meta messaging (Facebook / Instagram / WhatsApp)

**Adapters:** `App\Services\Messaging\Meta\*` implementing `MessagingChannelInterface`

**Capabilities**

- Dashboard connect / disconnect (paste tokens later)
- Webhook verify + ingest (`/api/webhooks/meta`, `/api/webhooks/whatsapp`)
- Inbound normalize → conversations/messages with idempotency
- Outbound with eligibility (pause, takeover, consent, WA window/templates)
- Local simulator when credentials absent (never reports `healthy` without live mode + tokens)
- Accounts list (seeded Pages/IG/WABA until live)

**Env**

```bash
META_APP_ID=
META_APP_SECRET=
META_VERIFY_TOKEN=triada-local-verify
META_WEBHOOK_SECRET=
META_PAGE_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_ACCESS_TOKEN=
```

**Routes**

- `GET /api/v1/integrations/meta/status`
- `POST /api/v1/integrations/meta/connect|disconnect|test-send|simulate-inbound`
- `GET /api/v1/integrations/meta/accounts|webhook`
- `POST /api/v1/integrations/meta/webhook/subscribe`
- `POST /api/v1/integrations/meta/verify-token/rotate`
- `GET|POST /api/webhooks/meta`
- `GET|POST /api/webhooks/whatsapp`

**UI:** `/integrations/meta` — day-to-day Meta messaging ops. One-time Developer App / App Review may still require Meta once.

## Shopify

**Services:** `App\Services\Commerce\Shopify\ShopifyClient`, `ShopifySyncService`

**Capabilities**

- Connect / disconnect (paste Admin API token or OAuth scaffold URL when `SHOPIFY_CLIENT_ID` set)
- Product + order sync (local simulator fixtures when credentials absent)
- Webhook ingest `POST /api/webhooks/shopify` with HMAC verification when secret set
- Admin UI: `/integrations/shopify`

**Env:** `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `SHOPIFY_REDIRECT_URI`, `SHOPIFY_SHOP_DOMAIN`, `SHOPIFY_ACCESS_TOKEN`, `SHOPIFY_WEBHOOK_SECRET`

Status stays **disconnected** / **awaiting_credentials** until live tokens + `INTEGRATION_MODE=live`. Never claim healthy without that.

## Telegram / TikTok / Email / Webchat

**Services:** `App\Services\Messaging\Channels\*`

| Channel | Webhook | Admin |
|---|---|---|
| Telegram | `POST /api/webhooks/telegram` | `/integrations/channels` |
| TikTok | `POST /api/webhooks/tiktok` | `/integrations/channels` |
| Email | `POST /api/webhooks/email` | `/integrations/channels` |
| Webchat | Public `POST /api/v1/webchat/messages` + embed `/widget/chat.js` | token ensure on channels page |

Local inbound simulator: `POST /api/v1/integrations/channels/simulate-inbound`.

## AI orchestration

**Adapter:** `LlmAdapterInterface` → `LocalHeuristicLlmAdapter` (default) or `HttpLlmAdapter` when `LLM_API_KEY` + live mode.

**Orchestrator:** classify / draft / qualify / escalate; wired into Meta inbound + channel inbound + automation `draft_reply` / `ai_*` actions.

**Admin:** `/agents` — enable/pause, prompts, test run, `ai_runs` activity.

## Content publishing

**Adapters:** WordPress + Meta page via `ContentPublishService`.

Gates: human approval + approval_version check before publish. UI: Content Studio + Calendar + publication logs.

## Meta App Review

See `docs/meta/APP_REVIEW_CHECKLIST.md`.

## Honesty policy

Local fallback responses are labeled `source: seeded` / `local` / `awaiting_credentials`. Live failures surface as `status: error` with a message—never silent fake success presented as production connectivity. Meta/Shopify/LLM never report healthy without credentials and `INTEGRATION_MODE=live`.

Gap audit cross-link (Agent Store): `internal/spec-implementation-gap-audit.md` · fill notes: `internal/remaining-gaps-fill.md`.
