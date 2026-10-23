# Triada Designs — AI Sales & Marketing Operations Platform

Monorepo for the Triada Designs **admin / ops subdomain**: Next.js (JavaScript) staff dashboard with admin login, Laravel REST API, MySQL/Redis-ready infrastructure, first-class **WordPress** + **Zoho CRM** modules, and a **Meta messaging control plane** (Facebook / Instagram / WhatsApp) operable from the dashboard with a local simulator until credentials exist.

| Domain | Role |
|---|---|
| [triada-designs.com](https://triada-designs.com) | Public marketing / commerce |
| `ops.triada-designs.com` (this app) | Admin login + AI Sales OS |

Visiting `/` redirects to **Admin sign in**.

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js App Router, React, JavaScript only, Tailwind |
| Backend | Laravel 13 REST API, Sanctum auth |
| Database | MySQL (Docker) or SQLite for local API development |
| Queue/cache | Redis (Docker) / database driver locally |
| Commerce | Shopify adapter scaffolding (disconnected until OAuth) |
| CMS | WordPress REST client (local seed / live) |
| CRM | Zoho CRM client (local seed / live) |

## Repository layout

```text
apps/web          Next.js admin/ops dashboard (login-first subdomain app)
apps/api          Laravel API, migrations, WP/Zoho services
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

- Email: `admin@triada-designs.com`
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

Local seed admin: `admin@triada-designs.com` / `triada-local`.

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

### Connect Zoho CRM (live)

1. Create a Zoho API console client and generate a refresh token with CRM scopes.
2. Set:

```bash
INTEGRATION_MODE=live
ZOHO_CLIENT_ID=...
ZOHO_CLIENT_SECRET=...
ZOHO_REFRESH_TOKEN=...
ZOHO_API_DOMAIN=https://www.zohoapis.com
ZOHO_ACCOUNTS_URL=https://accounts.zoho.com
ZOHO_WEBHOOK_SECRET=long-random-secret
```

3. Point Zoho webhooks to `POST /api/webhooks/zoho` with header `X-Triada-Webhook-Secret`.

Health endpoint (authenticated): `GET /api/v1/integrations/health`

## Meta messaging (local simulator by default)

Day-to-day Facebook Messenger, Instagram Messaging, and WhatsApp Cloud API ops are managed from **Integrations → Meta messaging** (`/integrations/meta`). Creating a Meta Developer App / App Review may still require Meta once; after that Triada owns connect, webhooks, health, messaging, templates eligibility, automations, pause/resume, and logs.

```bash
# Optional — leave empty for local simulator (never reports live healthy without tokens)
META_APP_ID=
META_APP_SECRET=
META_VERIFY_TOKEN=triada-local-verify
META_WEBHOOK_SECRET=
META_PAGE_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
INTEGRATION_MODE=local   # set live only with real tokens
```

- Webhooks: `GET|POST /api/webhooks/meta`, `GET|POST /api/webhooks/whatsapp`
- Simulate inbound: UI simulator or `POST /api/v1/integrations/meta/simulate-inbound`
- Emergency pauses: Settings → outbound / automations

## Milestone status

This repository ships a **usable production-oriented slice** (not full E2E of the implementation spec):

- Auth (Sanctum), workspace/roles seed via `TriadaWorkspaceSeeder`
- Dashboard overview with persisted metrics
- Unified inbox + human takeover + Meta channel filters
- Contacts, leads, opportunities, products, services, content approval
- WordPress + Zoho modules with local seed / live modes
- Meta messaging control plane + local simulator (credentials later)
- Automation runtime + Meta-aware workflows + JS builder
- Working shells: agents, knowledge, calendar, campaigns, analytics, team, audit logs, settings
- Brand design system (ivory/sand/brown, Cormorant + DM Sans)

Later milestones: live Meta App Review + tokens, Shopify sync, full Content Studio publishing adapters, AI orchestration, AWS production hardening.

## Docs

- `docs/ARCHITECTURE.md`
- `docs/INTEGRATIONS.md`
- `docs/DATABASE_SCHEMA.md`
- `docs/SECURITY.md`
- `docs/DEPLOYMENT.md`
