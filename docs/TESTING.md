# Testing

## API

```bash
cd apps/api
php artisan test
```

Feature coverage in Milestone 1 focuses on health, auth login, and integration mock health.

## Web

```bash
cd apps/web
npm run lint
npm run build
```

## Manual smoke

1. Open ops app root → redirects to admin login
2. Sign in with demo credentials
3. Overview metrics load
4. Open inbox conversation, takeover, reply
5. Integrations page shows WordPress/Zoho mock health
6. Approve content item
