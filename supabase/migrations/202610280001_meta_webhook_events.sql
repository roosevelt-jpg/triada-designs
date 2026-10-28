-- Slice 1: Meta webhook ingest stub table (Supabase Postgres).
-- Apply via Supabase SQL editor or CLI when credentials exist.
-- Laravel apps/api WebhookEvent remains until later slices.

create table if not exists public.meta_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'meta',
  object_type text,
  provider_event_id text,
  payload_hash text not null,
  payload jsonb,
  processing_status text not null default 'received',
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create index if not exists meta_webhook_events_provider_event_id_idx
  on public.meta_webhook_events (provider_event_id);

create index if not exists meta_webhook_events_payload_hash_idx
  on public.meta_webhook_events (payload_hash);

create index if not exists meta_webhook_events_received_at_idx
  on public.meta_webhook_events (received_at desc);

alter table public.meta_webhook_events enable row level security;

-- Service role bypasses RLS. No anon policies: browser must not read raw webhooks.
comment on table public.meta_webhook_events is
  'Triada Meta webhook ingest (Slice 1 stub). Service-role writes from Next Route Handlers.';
