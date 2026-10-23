# Deployment

## Hosting model

| Surface | Host | Purpose |
|---|---|---|
| Public marketing / commerce | `https://triada-designs.com` | Customer-facing brand site (WordPress/Shopify as applicable) |
| **Admin / AI Sales OS (this repo)** | `https://ops.triada-designs.com` (configurable subdomain) | Staff login, inbox, CRM, content approval, integrations |
| API | AWS (`api.*` or internal ALB) | Laravel REST + webhooks |

This Next.js app is **not** the public marketing homepage. Root `/` redirects to `/login` for admin sign-in.

Suggested subdomain names: `ops`, `app`, or `admin` — set `NEXT_PUBLIC_OPS_HOST` to match DNS.

## Frontend (Vercel)

- Root directory: `apps/web`
- Config: `apps/web/vercel.json`
- Build: `npm run build`
- Custom domain: attach the ops subdomain (e.g. `ops.triada-designs.com`)
- Env:

```bash
NEXT_PUBLIC_API_BASE_URL=https://api.example.com/api
NEXT_PUBLIC_PUBLIC_SITE_URL=https://triada-designs.com
NEXT_PUBLIC_OPS_HOST=ops.triada-designs.com
API_ORIGIN=https://api.example.com
```

- Do not put Laravel DB or provider secrets in `NEXT_PUBLIC_*`.
- Keep `robots` noindex on the admin app (already set in root layout).
- Webchat embed: `/widget/chat.js` (CORS headers in `vercel.json`).

## Backend (AWS)

Scaffold under `infrastructure/aws/` (ECS task defs, CloudFormation skeleton, `env.production.example`).

- ECS Fargate for API + queue workers
- RDS MySQL, ElastiCache Redis, S3 media
- Secrets Manager for production credentials
- ALB + ACM TLS
- CORS / `FRONTEND_URL` must allow the ops subdomain origin

```bash
FRONTEND_URL=https://ops.triada-designs.com
APP_URL=https://api.example.com
```

Verify without cloud accounts:

```bash
./scripts/verify-aws-dry-run.sh
./scripts/deploy-dry-run.sh
```

## Local Docker

```bash
docker compose -f infrastructure/compose.yaml up --build
```

Local entry: open `http://127.0.0.1:43127` → redirects to admin login.

```bash
./scripts/verify-local.sh
```

## CI

GitHub Actions (`.github/workflows/ci.yml`): web lint/build, API PHPUnit, AWS/Vercel scaffold verify, optional Playwright/a11y (continue-on-error if browsers missing).
