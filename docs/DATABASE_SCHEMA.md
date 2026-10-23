# Database schema (Milestone 1)

MySQL-compatible migrations in `apps/api/database/migrations`. Local development often uses SQLite; Docker Compose provides MySQL.

## Identity

- `workspaces`
- `users` (+ `last_login_at`)
- `roles`
- `workspace_memberships`
- `personal_access_tokens` (Sanctum)
- `audit_logs` (append-oriented)

## Integrations

- `integrations`
- `integration_secrets` (encrypted values)
- `webhook_events` (idempotent provider event IDs)
- `sync_cursors`

## CRM / messaging

- `contacts` (+ normalized email/phone indexes)
- `contact_identities`
- `conversations`
- `messages`
- `leads` (+ `external_crm_id` for Zoho)
- `tasks`
- `products`
- `services`
- `content_items`

Later milestones add consent, opportunities, knowledge chunks, AI runs, campaigns, scheduled posts, and automation tables per the full implementation specification.
