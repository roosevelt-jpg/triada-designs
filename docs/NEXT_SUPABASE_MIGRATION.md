# Next.js + Supabase migration (repo pointer)

The durable, project-owned migration plan lives in Cursor Project Context:

**`/cursor/stores/self/docs/next-supabase-migration.md`**

This repo slice implements **Slice 1**:

- Supabase JS clients under `apps/web/src/lib/supabase/`
- Meta webhook Route Handler: `apps/web/src/app/api/webhooks/meta/route.js`
- Rewrite dual-mode: Laravel proxy in `fallback` so filesystem routes (`/api/webhooks/meta`) win
- SQL stub: `supabase/migrations/202610280001_meta_webhook_events.sql`
- Laravel `apps/api` retained; Meta Callback URL should target Next on Vercel

### Exact Meta Callback URL

```text
https://dashboard.triada-designs.com/api/webhooks/meta
```

Alternate (if `api.triada-designs.com` rewrites to Vercel):

```text
https://api.triada-designs.com/api/webhooks/meta
```
