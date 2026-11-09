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

- Connect / disconnect (status-only in dashboard; Admin API token on Vercel / host env)
- Product + order sync (local simulator fixtures when credentials absent)
- **Outbound product publish** from dashboard Products → Shopify Admin API create/update when `SHOPIFY_ACCESS_TOKEN` present (`write_products` scope recommended)
- WordPress marketing posts for the same product when `WORDPRESS_*` Application Password env is present
- Webhook ingest `POST /api/webhooks/shopify` with HMAC verification when secret set
- Admin UI: `/integrations/shopify`, catalog UI: `/products`

**Env:** `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `SHOPIFY_REDIRECT_URI`, `SHOPIFY_SHOP_DOMAIN`, `SHOPIFY_ACCESS_TOKEN` (or `SHOPIFY_ADMIN_ACCESS_TOKEN`), `SHOPIFY_WEBHOOK_SECRET`, `SHOPIFY_SCOPES` (include `write_products` for publish)

Status stays **disconnected** / **awaiting_credentials** until live tokens. Never claim healthy without that. See `/cursor/stores/self/docs/product-channel-publish.md`.

## Telegram / TikTok / Email / Webchat / LinkedIn

**Services:** Next.js `/api/webhooks/*` (preferred) + legacy `App\Services\Messaging\Channels\*`

| Channel | Webhook | Admin |
|---|---|---|
| Telegram | `POST /api/webhooks/telegram` (+ GET health / challenge echo) | `/integrations/channels` |
| TikTok | `POST /api/webhooks/tiktok` (+ GET challenge echo) | `/integrations/channels` |
| Email | `POST /api/webhooks/email` | `/integrations/channels` |
| LinkedIn | `POST /api/webhooks/linkedin` (+ GET challenge echo) | `/integrations/channels` |
| Webchat | Public `POST /api/v1/webchat/messages` + embed `/widget/chat.js` | token ensure on channels page |

Telegram Bot Messaging: early-200 accept → background AI Support auto-reply → Unified Inbox trails. Optional `TELEGRAM_WEBHOOK_SECRET` / `TELEGRAM_BOT_WEBHOOK_SECRET` (header `x-telegram-bot-api-secret-token` / `x-channel-webhook-secret`). Live outbound needs `TELEGRAM_BOT_TOKEN` (Bot API `sendMessage`); otherwise `local_sim`. Point BotFather `setWebhook` at `/api/webhooks/telegram`.

LinkedIn Messaging: early-200 accept → background AI Support auto-reply → Unified Inbox trails. Optional `LINKEDIN_WEBHOOK_SECRET` (headers `x-linkedin-webhook-secret` / `x-channel-webhook-secret`). Live outbound needs `LINKEDIN_ACCESS_TOKEN` (or `LINKEDIN_API_KEY`); otherwise `local_sim`.

TikTok Messaging: early-200 accept → background AI Support auto-reply → Unified Inbox trails. Optional `TIKTOK_WEBHOOK_SECRET` (headers `x-tiktok-webhook-secret` / `x-tt-signature` / `x-channel-webhook-secret`). Live outbound needs `TIKTOK_ACCESS_TOKEN` (or `TIKTOK_API_KEY`); optional `TIKTOK_OPEN_ID` / `TIKTOK_BUSINESS_ID`; otherwise `local_sim`.

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

**Flow:** generate (UGC/creative) → `in_review` pending approval → admin approve → calendar `scheduled_for` → Vercel Cron `/api/cron/content-publish` (or manual Publish).

Cron worker: `POST /api/v1/cron/content-publish/process` (Bearer `CRON_SECRET`) drains due `scheduled` items without skipping approval gates.

## Creative AI (Anthropic scripts → Higgsfield pixels)

**Honest split:** Anthropic Claude writes captions, UGC scripts, and storyboards. **Claude cannot render pixels alone.** Higgsfield mints professional stills (Soul V2) and videos (Seedance 2.5) the same way end users do via the Higgsfield API. Gemini remains fallback when Higgsfield is unset or fails.

| Layer | Env / UI | Role |
|---|---|---|
| Scripts / briefs | Anthropic on Integrations, or `ANTHROPIC_*` | Text intelligence |
| Image pixels (preferred) | Higgsfield Key ID + Secret — env or Integrations store | Soul V2 stills (`higgsfield-ai/soul/v2/standard`) |
| Video pixels (preferred) | Same Higgsfield credentials | Seedance 2.5 text-to-video / image-to-video |
| Image / video fallback | `GEMINI_API_KEY` / Gemini media models | When Higgsfield unset or fails |
| Local animation | no keys | SVG motion + placeholder (local mock) |

**All AI agents (Next):** `GET/POST /api/v1/agents/creative-tools` — every roster agent can execute `generate_image`, `generate_short_video`, `generate_ugc_video`, `generate_quote_inspiration`, etc. Orchestration and **Assign task** also infer tools from purpose/message/title and run Anthropic → Higgsfield when creative intent is detected. Output always enters Content Studio / Inspiration `in_review` (never auto-publishes).

**Quote / Inspiration:** Anthropic writes the quote + caption; Higgsfield Soul V2 mints the card (Gemini fallback, SVG last resort). Same credential path as Content Studio.

**Pro params** (Content Studio + tool payload): `model` / `image_model` / `video_model`, `resolution`, `aspect_ratio`, `duration` / `duration_ms`, `seed`, `style_id`, `custom_reference_id`, `image_url` (public URL for image→video), `enhance_prompt`, `generate_audio`, `bitrate_mode`.

### Higgsfield (status-only)

**Never paste credentials in the dashboard.** Preferred: set on Vercel Production. When `VERCEL_TOKEN` is unavailable, keys may be applied via the Integrations encrypted store (`integration_secrets` / `supabase_table`) — Creative media resolves **env first, then store** (same pattern as Anthropic/Shopify).

```bash
HIGGSFIELD_API_KEY_ID=
HIGGSFIELD_API_KEY_SECRET=
# Optional:
# HIGGSFIELD_BASE_URL=https://api.higgsfield.ai
# HIGGSFIELD_IMAGE_ENDPOINT=higgsfield-ai/soul/v2/standard
# HIGGSFIELD_VIDEO_ENDPOINT=bytedance/seedance-2.5/text-to-video
# HIGGSFIELD_RESOLUTION=720p
# HIGGSFIELD_VIDEO_RESOLUTION=720p
# HIGGSFIELD_TIMEOUT=120          # Soul V2 poll floor 90s
# HIGGSFIELD_VIDEO_TIMEOUT=180    # Seedance poll floor 120s
# HIGGSFIELD_WEBHOOK_SECRET=      # whsec_… if using inbound webhooks later
# HF_API_KEY_ID= / HF_API_KEY_SECRET=  # aliases
```

Auth header (official): `Authorization: Key ${HIGGSFIELD_API_KEY_ID}:${HIGGSFIELD_API_KEY_SECRET}`.

Integrations shows **Connected** when both Key ID and Secret are present in **env or store**; otherwise **Waiting credentials**. Content Studio prefers Higgsfield for **images and videos** when Connected; Gemini remains fallback.

```bash
# Scripts (required for live agent/creative intelligence)
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-20250514

# Optional Gemini fallback for pixels
GEMINI_API_KEY=
IMAGE_MODEL=gemini-3-pro-image
VIDEO_MODEL=gemini-omni-1.1-flash
```

Without Higgsfield or Gemini keys, Content Studio still generates operable local_sim stubs and queues them for approval.

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
