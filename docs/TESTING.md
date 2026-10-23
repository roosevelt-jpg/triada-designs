# Testing

## API

```bash
cd apps/api
php artisan test
```

Feature coverage in the foundation slice focuses on health, seed-admin login, and integration local-seed health.

## Web

```bash
cd apps/web
npm run lint
npm run build
```

## Manual smoke

1. Open ops app root → redirects to admin login
2. Sign in with local seed admin (`admin@triada-designs.com` / `triada-local`)
3. Overview metrics load
4. Open inbox conversation, takeover, reply
5. Integrations page shows WordPress/Zoho **seeded** health (not live)
6. Approve content item
