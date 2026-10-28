# api.triada-designs.com — public Laravel API

## Target URLs

| Use | URL |
|---|---|
| Public API base | `https://api.triada-designs.com` |
| Health | `https://api.triada-designs.com/api/health` |
| Meta webhook (Callback URL) | `https://api.triada-designs.com/api/webhooks/meta` |
| Meta verify token (default until rotated) | `triada-local-verify` |

## Preferred host: Render (blueprint already in repo)

1. Open [Render Blueprints](https://dashboard.render.com/blueprints) → **New Blueprint Instance**.
2. Connect GitHub repo **`roosevelt-jpg/triada-designs`**, branch **`main`** (uses root `render.yaml`).
3. Apply. Service name: **`triada-api`** → hostname like `https://triada-api.onrender.com`.
4. Confirm env includes `INTEGRATION_MODE=live`, `APP_URL=https://api.triada-designs.com`, CORS/Sanctum dashboard origins, `META_VERIFY_TOKEN`.
5. Paste remaining live credentials (Shopify/Meta/Zoho/etc.) in Render **Environment** — never commit them.
6. **Custom Domains** → add `api.triada-designs.com`.

### DNS (GoDaddy — current NS)

`triada-designs.com` nameservers are **`ns71.domaincontrol.com` / `ns72.domaincontrol.com`** (GoDaddy).  
`api.triada-designs.com` is currently **NXDOMAIN**.

In GoDaddy → DNS → Records:

| Type | Name / Host | Value / Points to | TTL |
|---|---|---|---|
| **CNAME** | `api` | `triada-api.onrender.com` (exact Render hostname) | 600 or default |

Do **not** create an A record unless Render shows a fixed IP (they usually want CNAME).

After DNS propagates, complete Render’s domain verification / HTTPS.

## Optional host: Fly.io

Config: `infrastructure/fly.toml` + `infrastructure/docker/api.Dockerfile`.

```bash
fly auth login   # or FLY_API_TOKEN
fly apps create triada-api
fly secrets set APP_KEY=base64:... APP_URL=https://api.triada-designs.com
fly deploy --config infrastructure/fly.toml --dockerfile infrastructure/docker/api.Dockerfile --path apps/api
fly certs add api.triada-designs.com
```

DNS CNAME `api` → `triada-api.fly.dev` (or the target Fly shows).

## Vercel Production

Project `triada-ops` (`prj_3UDZA3gJdPhNwL0KHlJ7WoSmzBOU`):

| Name | Value |
|---|---|
| `API_ORIGIN` | `https://api.triada-designs.com` (no trailing slash) |
| `NEXT_PUBLIC_API_BASE_URL` | `/api` |

Redeploy Production after changing env.

Until the custom domain is live, you may temporarily set `API_ORIGIN` to the Render `*.onrender.com` URL (or a Cloudflare quick tunnel), then switch to `https://api.triada-designs.com`.

## Agent secrets required for autonomous deploy

| Secret | Purpose |
|---|---|
| `RENDER_API_KEY` (preferred) | Create/update Render service from blueprint |
| `VERCEL_TOKEN` | Set Production `API_ORIGIN` + redeploy |
| `FLY_API_TOKEN` | Alternative to Render |
| `CLOUDFLARE_API_TOKEN` | Only if DNS moves to Cloudflare |

## Prove after cutover

```bash
curl -sS https://api.triada-designs.com/api/health
curl -sS -w '\n%{http_code}\n' \
  'https://api.triada-designs.com/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=triada-local-verify&hub.challenge=ok'
curl -sS -w '\n%{http_code}\n' -X POST \
  'https://dashboard.triada-designs.com/api/v1/auth/login' \
  -H 'Content-Type: application/json' \
  -d '{"email":"info@triada-designs.com","password":"<admin-password>"}'
```
