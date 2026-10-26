# Operations runbook (foundation)

## Local seed reset

```bash
cd apps/api
php artisan migrate:fresh --seed
```

Local seed admin: `info@triada-designs.com` / `triada-local`.

## Emergency pauses (later)

Admin controls to pause AI replies and scheduled publishing must be enforced server-side and re-checked by queue jobs.

## Integration failures

1. Check `GET /api/v1/integrations/health`
2. Inspect `integrations.last_error_code`
3. Review `webhook_events` for stuck processing
4. Rotate secrets without exposing plaintext in API responses
