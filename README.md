# Triada Designs — AI Sales & Marketing Operations Platform

Monorepo for the Triada Designs **admin / ops subdomain**: Next.js (JavaScript) staff dashboard with admin login, Laravel REST API, MySQL/Redis-ready infrastructure, and first-class **WordPress** + **Zoho CRM** integration modules.

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
| Database | MySQL (Docker) or SQLite for local API demo |
| Queue/cache | Redis (Docker) / database driver locally |
| Commerce | Shopify adapter scaffolding |
| CMS | WordPress REST client (mock/live) |
| CRM | Zoho CRM client (mock/live) |

## Repository layout

```text
apps/web          Next.js admin/ops dashboard (login-first subdomain app)
apps/api          Laravel API, migrations, WP/Zoho services
infrastructure/   Docker Compose + Dockerfiles
docs/             Architecture and integration docs
packages/         Shared contracts (OpenAPI placeholder)
```

## Quick start (local demo)

### 1. API (Laravel)

```bash
cd apps/api
cp .env.example .env   # if needed
php artisan key:generate
touch database/database.sqlite
php artisan migrate --seed
php artisan serve --host=127.0.0.1 --port=8088
```

Demo user:

- Email: `admin@triada-designs.com`
- Password: `triada-demo`

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

Demo login: `admin@triada-designs.com` / `triada-demo`.

### Docker Compose (MySQL + Redis + services)

```bash
docker compose -f infrastructure/compose.yaml up --build
```

## WordPress + Zoho (mock by default)

`INTEGRATION_MODE=mock` (default) returns fixture data so the platform runs without credentials.

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

## Milestone status

This repository ships **Milestone 1 foundation** as a usable slice:

- Auth (Sanctum), workspace/roles seed
- Dashboard overview with persisted metrics
- Unified inbox + human takeover
- Contacts, leads, products, services, content approval
- WordPress + Zoho modules with mock/live modes
- Brand design system (ivory/sand/brown, Cormorant + DM Sans)
- Marketing homepage + operations shell

Later milestones: live Meta/WhatsApp channels, Shopify sync, full Content Studio publishing, automation engine, AWS production hardening.

## Docs

- `docs/ARCHITECTURE.md`
- `docs/INTEGRATIONS.md`
- `docs/DATABASE_SCHEMA.md`
- `docs/SECURITY.md`
- `docs/DEPLOYMENT.md`
