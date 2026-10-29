-- Jewellery-ops automation records for Next dual-run (no Laravel).
-- Kinds: abandonment, after_sale, waitlist, telegram_alert, gift_session,
-- custom_piece, commerce_order, ugc, outreach_prospect, outreach_message,
-- manufacturer_material, manufacturer_job, vip_drop.

create table if not exists public.jewellery_ops_records (
  id text primary key,
  workspace_id text not null default 'triada-ops',
  kind text not null,
  status text not null default 'open',
  run_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists jewellery_ops_records_workspace_kind_idx
  on public.jewellery_ops_records (workspace_id, kind, updated_at desc);

create index if not exists jewellery_ops_records_due_idx
  on public.jewellery_ops_records (workspace_id, kind, status, run_at);

alter table public.jewellery_ops_records enable row level security;

comment on table public.jewellery_ops_records is
  'Triada jewellery-ops automation queue and entities for Next+Supabase runners (abandonment, after-sale, waitlist, alerts, etc.).';
