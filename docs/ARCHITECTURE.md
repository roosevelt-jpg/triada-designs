# Architecture

## Overview

Triada Designs AI Sales OS is a monorepo with:

- `apps/web` — Next.js App Router (JavaScript only) **admin/ops subdomain app** (login → dashboard). Public marketing remains on `triada-designs.com`.
- `apps/api` — Laravel REST API under `/api/v1`, Sanctum bearer tokens, webhook routes under `/api/webhooks/*`.
- `infrastructure/` — Docker Compose for MySQL, Redis, API, and web.

```text
Public site                 Ops subdomain (this repo)
triada-designs.com          ops.triada-designs.com
                                   |
                                   v
                            Next.js admin (Vercel)
                             /login → dashboard
                                   |
                                   v
                            Laravel API (AWS)
                              |        |         |
                              v        v         v
                            MySQL   Redis/S3   Provider adapters
                                                 (WP, Zoho, Shopify, Meta, …)
```

## Design principles

1. Channel adapters normalize inbound events before CRM/AI processing.
2. Workspace isolation is enforced on every query.
3. Public social publishing requires human approval (backend-enforced).
4. Integrations default to mock/local fallbacks until credentials are present.
5. Frontend never receives provider secrets.

## Milestone 1 surface

- Admin login (app root redirects here; ops subdomain)
- Overview, inbox, conversation detail (takeover/resume AI)
- Contacts, leads (Zoho sync action)
- Products, services, content approval
- Integrations health for WordPress + Zoho
