# Integrations

## Modes

| Mode | Behavior |
|---|---|
| `mock` (default) | Clients return fixture data; webhooks accept when secret unset |
| `live` | Real HTTP calls; requires credentials |

Set `INTEGRATION_MODE` in `apps/api/.env`.

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

## Shopify (scaffolded)

Config keys exist; product records are local until a secure OAuth connection and scopes are completed in a later milestone. Do not claim live Shopify sync until authorized and tested.

## Honesty policy

Mock responses are labeled `source: mock`. Live failures surface as `status: error` with a message—never silent fake success presented as production connectivity.
