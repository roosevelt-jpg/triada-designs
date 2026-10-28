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

## AI orchestration (Gemini)

**Adapter:** `LlmAdapterInterface` → `GeminiHttpAdapter` when `LLM_PROVIDER=gemini` and `GEMINI_API_KEY` is set; otherwise `LocalHeuristicLlmAdapter`. OpenAI-compatible remains available via `HttpLlmAdapter` when `LLM_PROVIDER=openai_compatible`, `LLM_API_KEY`, and `INTEGRATION_MODE=live`.

**Status honesty:** Without a Gemini key, LLM status is `awaiting_credentials` — never reported as live Gemini success. Test runs use Gemini only when the key is present.

**Env**

```bash
LLM_PROVIDER=gemini          # gemini | local | openai_compatible
GEMINI_API_KEY=              # required for live agents
GEMINI_MODEL=gemini-2.0-flash
GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta
# optional openai-compatible path:
LLM_API_KEY=
LLM_MODEL=gpt-4o-mini
LLM_BASE_URL=https://api.openai.com/v1
```

**Orchestrator:** classify / draft / qualify / escalate; wired into Meta inbound + channel inbound + automation `draft_reply` / `ai_*` actions.

**Admin:** `/agents` — provider badge, env-doc for Gemini key, enable/pause, prompts, test run, `ai_runs` activity. Settings also documents the Gemini env path.

## System time

**Route:** `GET /api/v1/system/time` (Sanctum) → `{ utc, workspace_local, timezone, unix_ms, offset_minutes }`.

Ops UI formatters and the header clock sync skew + workspace IANA timezone from this endpoint. Calendar/scheduling “now” uses the same server-aligned clock. Workspace timezone is editable under Settings.

## Content publishing

**Adapters:** WordPress + Meta page via `ContentPublishService`.

Gates: human approval + approval_version check before publish. UI: Content Studio + Calendar + publication logs.

## Meta App Review

See `docs/meta/APP_REVIEW_CHECKLIST.md`.

## Google Places (popup locations)

**Status-only** on Integrations (`Connected` / `Waiting credentials`). Keys are never entered in the dashboard — set on Vercel.

**Env (first non-empty wins)**

```bash
GOOGLE_PLACES_API_KEY=
GOOGLE_MAPS_API_KEY=
# Optional browser mirrors (prefer referrer-restricted keys):
NEXT_PUBLIC_GOOGLE_PLACES_API_KEY=
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
```

**Routes**

- `GET /api/v1/integrations/health` → `google_places` status (no secret)
- `GET /api/v1/integrations/google-places` → status + `browser_key` when Connected (for Maps JS Autocomplete)
- Pop-ups form (`/popups`) uses Places Autocomplete for country / city / town and a draggable map pin (`lat` / `lng`)

Enable **Maps JavaScript API** + **Places API** on the Google Cloud key. Restrict by HTTP referrer for browser use.

## Honesty policy

Local fallback responses are labeled `source: seeded` / `local` / `awaiting_credentials`. Live failures surface as `status: error` with a message—never silent fake success presented as production connectivity. Meta/Shopify/LLM never report healthy without credentials and `INTEGRATION_MODE=live`.

Gap audit cross-link (Agent Store): `internal/spec-implementation-gap-audit.md` · fill notes: `internal/remaining-gaps-fill.md`.
