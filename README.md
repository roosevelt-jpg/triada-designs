# Triada Designs — AI Sales & Marketing Operations Platform

Monorepo for the Triada Designs **admin / ops subdomain**: Next.js (JavaScript) staff dashboard with admin login, migrating toward **Next.js-only + Supabase** while dual-running Laravel for remaining `/api/v1` routes. First-class **WordPress** + **Zoho CRM** modules and a **Meta messaging control plane** (Facebook / Instagram / WhatsApp) stay operable from the dashboard with a local simulator until credentials exist.

| Domain | Role |
|---|---|
| [triada-designs.com](https://triada-designs.com) | Public marketing / commerce |
| `dashboard.triada-designs.com` / ops host (this app) | Admin login + AI Sales OS (Vercel) |
| `api.triada-designs.com` (dual-run) | Laravel until retired; may rewrite to Vercel later |

Visiting `/` redirects to **Admin sign in**.

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js App Router, React, **JavaScript only**, Tailwind |
| Target backend | **Supabase** (Auth + Postgres) + Next Route Handlers |
| Dual-run backend | Laravel 13 REST `/api/v1` + Sanctum (kept until slices finish) |
| Database (target) | Supabase Postgres (`supabase/migrations`) |
| Database (legacy) | MySQL (Docker) or SQLite for local Laravel |
| Cron | Existing **Vercel Cron** (`apps/web/vercel.json`) |
| Commerce / CMS / CRM | Shopify, WordPress, Zoho adapters (local seed / live) |

Migration plan: durable doc in the project store — `docs/next-supabase-migration.md` (Context). Repo mirror notes also under `docs/` as slices land.

## Repository layout

```text
apps/web          Next.js admin/ops dashboard (login-first; owns Meta webhook)
apps/api          Laravel API (kept; not required for /api/webhooks/meta)
supabase/         Postgres migrations for Supabase
infrastructure/   Docker Compose + Dockerfiles
docs/             Architecture and integration docs
packages/         Shared contracts (OpenAPI placeholder)
```

## Quick start (local seed)

### 1. API (Laravel)

```bash
cd apps/api
cp .env.example .env   # if needed
php artisan key:generate
touch database/database.sqlite
php artisan migrate --seed
php artisan serve --host=127.0.0.1 --port=8088
```

Local seed admin:

- Email: `info@triada-designs.com`
- Password: `triada-local`

### 2. Web (Next.js)

```bash
cd apps/web
cp .env.example .env.local
npm install
npm run dev
```

Open [http://127.0.0.1:43127](http://127.0.0.1:43127) — redirects to admin login.

### Open from your laptop browser (Cloud Agent)

`127.0.0.1` in chat is the **agent VM**, not your Mac/PC. To use your machine’s browser:

1. Keep this agent’s web server running on port **43127** (bound to `0.0.0.0`).
2. In Cursor Desktop **Agents Window**, open **Forwarded Ports** (plug icon).
3. Forward port **43127** (API is proxied through Next.js at `/api`, so you do not need 8088).
4. On your laptop open [http://localhost:43127/login](http://localhost:43127/login).

Local seed admin: `info@triada-designs.com` / `triada-local`.

### Docker Compose (MySQL + Redis + services)

```bash
docker compose -f infrastructure/compose.yaml up --build
```

## WordPress + Zoho (local seed by default)

`INTEGRATION_MODE=local` (default; `mock` is an accepted alias) returns seeded fixture data so the platform runs without credentials. Status language in the UI: **local / seeded / live / disconnected / awaiting credentials** — never presented as healthy live Meta/Shopify when not connected.

### Connect WordPress (live)

1. Create a WordPress Application Password for an editor/admin user.
2. Set in `apps/api/.env`:

```bash
INTEGRATION_MODE=live
WORDPRESS_BASE_URL=https://your-wordpress-site.example
WORDPRESS_USERNAME=your-user
WORDPRESS_APPLICATION_PASSWORD=xxxx xxxx xxxx xxxx xxxx xxxx
WORDPRESS_WEBHOOK_SECRET=long-random-secret
```

3. Point webhooks to `POST /api/webhooks/wordpress` with header `X-Triada-Webhook-Secret`.

### Connect Zoho CRM + Books (live)

Prefer **Zoho Books** for invoice PDF / UAE e-invoice (CRM alone is not enough for accounting PDFs). Use CRM for customer/lead sync.

1. Create a Zoho API console client with CRM + Books scopes; generate a refresh token.
2. Paste on **Integrations → Zoho CRM + Books** (Client ID / Secret / Refresh token / Books organization ID), or set env:

```bash
INTEGRATION_MODE=live
ZOHO_CLIENT_ID=...
ZOHO_CLIENT_SECRET=...
ZOHO_REFRESH_TOKEN=...
ZOHO_ORGANIZATION_ID=...   # Books org — required for invoices / UAE e-invoice
ZOHO_API_DOMAIN=https://www.zohoapis.com
ZOHO_ACCOUNTS_URL=https://accounts.zoho.com
ZOHO_WEBHOOK_SECRET=long-random-secret
```

3. Point Zoho webhooks to `POST /api/webhooks/zoho` with header `X-Triada-Webhook-Secret`.

Health endpoint (authenticated): `GET /api/v1/integrations/health`

### Vercel Cron Jobs (abandonment + after-sale)

Abandonment and after-sale workers are **process-on-demand** (not always-on). Production uses **Vercel Cron Jobs** in `apps/web/vercel.json`:

| Cron path | Schedule | Laravel worker |
|---|---|---|
| `/api/cron/abandonment` | `0 * * * *` (hourly) | `POST /api/v1/cron/abandonment/process` |
| `/api/cron/after-sale` | `30 * * * *` | `POST /api/v1/cron/after-sale/process` |

Set the same `CRON_SECRET` on Vercel (web) and the API host. Set `API_ORIGIN` on Vercel to the Laravel base URL. Vercel sends `Authorization: Bearer <CRON_SECRET>` to cron paths.

### Shopify store

Default shop domain: `jwtjzw-nu.myshopify.com` (`SHOPIFY_SHOP_DOMAIN`). Paste Admin API access token on Integrations → Shopify when ready; stays `awaiting_credentials` / `local_sim` until token + `INTEGRATION_MODE=live`.

## Next.js + Supabase (dual-run) — required env

Set on **Vercel** (Production) and in `apps/web/.env.local` for local work:

| Variable | Required for | Notes |
|---|---|---|
| `SUPABASE_URL` | Live DB / Auth | Project URL |
| `SUPABASE_ANON_KEY` | Browser / RLS client | Safe with RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | Server webhook ingest | **Never** `NEXT_PUBLIC_` |
| `META_VERIFY_TOKEN` | Meta hub challenge | Must match Meta App webhook verify token (alias: `META_HUB_VERIFY_TOKEN`; default `triada-meta-verify-2026`) |
| `API_ORIGIN` | Dual-run `/api/v1` rewrite | Still required on Vercel until Laravel is retired |
| `CRON_SECRET` | Vercel Cron → workers | Existing |

Optional browser mirrors: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

Without Supabase credentials, Meta webhook **POST** ingest writes to a local mock store (`.triada-local/`) — status stays `local` / awaiting credentials, never fake live-healthy.

### Auth dual-run (login move)

- **Now:** Admin login still uses Laravel Sanctum (`POST /api/v1/auth/login`) for `info@triada-designs.com` / `triada-local` (local seed).
- **Next:** Supabase Auth for the same email; feature-flag cutover; then retire Sanctum.
- Do not switch the login form until the dedicated auth slice is proven.

### Meta Callback URL (Vercel-hosted)

Point Meta App → Webhooks **Callback URL** at Next (not Laravel):

```text
https://dashboard.triada-designs.com/api/webhooks/meta
```

If `api.triada-designs.com` is rewritten to the same Vercel deployment:

```text
https://api.triada-designs.com/api/webhooks/meta
```

Verify token = `META_VERIFY_TOKEN` or `META_HUB_VERIFY_TOKEN` (default `triada-meta-verify-2026`). `GET` returns plain-text `hub.challenge`; `POST` stores to Supabase (or local mock). Other `/api/webhooks/*` still proxy to Laravel during dual-run.

## Meta messaging (local simulator by default)

Day-to-day Facebook Messenger, Instagram Messaging, and WhatsApp Cloud API ops are managed from **Integrations → Meta messaging** (`/integrations/meta`). Creating a Meta Developer App / App Review may still require Meta once; after that Triada owns connect, webhooks, health, messaging, templates eligibility, automations, pause/resume, and logs.

```bash
# Optional — leave empty for local simulator (never reports live healthy without tokens)
META_APP_ID=
META_APP_SECRET=
META_VERIFY_TOKEN=triada-meta-verify-2026
META_HUB_VERIFY_TOKEN=triada-meta-verify-2026
META_WEBHOOK_SECRET=
META_PAGE_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
INTEGRATION_MODE=local   # set live only with real tokens
```

- Webhooks (Next): `GET|POST /api/webhooks/meta` — primary Callback URL above
- WhatsApp (Laravel dual-run for now): `GET|POST /api/webhooks/whatsapp`
- Simulate inbound: UI simulator or `POST /api/v1/integrations/meta/simulate-inbound`
- Emergency pauses: Settings → outbound / automations

## Shopify / channels / AI / publish (local simulators)

| Area | How to try |
|---|---|
| Shopify | `/integrations/shopify` → Sync products now (local fixtures) |
| Telegram/TikTok/Email/Webchat | `/integrations/channels` → Simulate inbound |
| Webchat embed | `/widget/chat.js` + token `wc_triada_local_widget` → `POST /api/v1/webchat/messages` |
| AI agents | `/agents` → Test run (local heuristic until `LLM_API_KEY`) |
| Content publish | Content Studio → Approve → Publish WordPress/Meta (approval version gate) |
| Meta App Review notes | `docs/meta/APP_REVIEW_CHECKLIST.md` |
| AWS/Vercel proof | `./scripts/verify-aws-dry-run.sh`, `apps/web/vercel.json`, `infrastructure/aws/` |
| e2e / a11y | `cd apps/web && npm run test:e2e` / `npm run test:a11y` (Playwright; skip if browsers fail to install) |

Status language: **local / seeded / live / disconnected / awaiting credentials** — Meta/Shopify/LLM never shown healthy without real tokens + `INTEGRATION_MODE=live`.

## Milestone status

Production-oriented platform slice with simulators for all major modules. Still blocked on real Meta App Review tokens, Shopify OAuth shop, LLM key, Telegram/TikTok/email provider accounts, and AWS/Vercel account deploy — configs and local verify scripts are shipped.

## Docs

- `docs/ARCHITECTURE.md`
- `docs/INTEGRATIONS.md`
- `docs/DATABASE_SCHEMA.md`
- `docs/SECURITY.md`
- `docs/DEPLOYMENT.md`
- `docs/meta/APP_REVIEW_CHECKLIST.md`
