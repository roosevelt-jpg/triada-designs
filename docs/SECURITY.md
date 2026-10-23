# Security

## Authentication

- Sanctum personal access tokens for the SPA/dashboard.
- Passwords hashed with bcrypt.
- Workspace membership required for business endpoints.

## Secrets

- Never commit real `.env` files.
- Integration secrets stay server-side.
- `IntegrationSecret` values are encrypted at rest via Laravel `encrypt()`.
- Frontend only receives `NEXT_PUBLIC_API_BASE_URL`.

## Content publishing

- Human approval is mandatory before public posts.
- AI cannot approve its own content.
- Approval version is stored on `content_items`.

## Webhooks

- Shared secret header `X-Triada-Webhook-Secret`.
- Provider event IDs deduplicated in `webhook_events`.

## AI / tooling (later milestones)

- Tool allowlists and server-side permission checks.
- No arbitrary SQL/shell/HTTP from model output.
