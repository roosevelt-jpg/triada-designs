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
- Build: `npm run build`
- Custom domain: attach the ops subdomain (e.g. `ops.triada-designs.com`)
- Env:

```bash
NEXT_PUBLIC_API_BASE_URL=https://api.example.com/api
NEXT_PUBLIC_PUBLIC_SITE_URL=https://triada-designs.com
NEXT_PUBLIC_OPS_HOST=ops.triada-designs.com
```

- Do not put Laravel DB or provider secrets in `NEXT_PUBLIC_*`.
- Keep `robots` noindex on the admin app (already set in root layout).

## Backend (AWS outline)

- ECS Fargate for API + queue workers
- RDS MySQL, ElastiCache Redis, S3 media
- Secrets Manager for production credentials
- ALB + ACM TLS
- CORS / `FRONTEND_URL` must allow the ops subdomain origin

```bash
FRONTEND_URL=https://ops.triada-designs.com
APP_URL=https://api.example.com
```

## Local Docker

```bash
docker compose -f infrastructure/compose.yaml up --build
```

Local entry: open `http://127.0.0.1:43127` → redirects to admin login.

## CI

GitHub Actions workflow lints/tests web and API on pull requests.
