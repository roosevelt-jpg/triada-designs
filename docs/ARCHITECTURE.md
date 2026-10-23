# Architecture

## Overview

Triada Designs AI Sales OS is a monorepo with:

- `apps/web` — Next.js App Router (JavaScript only) for the marketing site and authenticated operations dashboard.
- `apps/api` — Laravel REST API under `/api/v1`, Sanctum bearer tokens, webhook routes under `/api/webhooks/*`.
- `infrastructure/` — Docker Compose for MySQL, Redis, API, and web.

```text
Browser / Chat widget
        |
        v
   Next.js (Vercel)
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

- Marketing homepage
- Login
- Overview, inbox, conversation detail (takeover/resume AI)
- Contacts, leads (Zoho sync action)
- Products, services, content approval
- Integrations health for WordPress + Zoho
