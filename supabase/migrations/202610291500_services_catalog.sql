-- Admin-managed services catalog (Next dual-run).
-- Empty by default — admin adds/edits/deletes; no hardcoded seed rows.
-- Service-role writes from Next Route Handlers.

create table if not exists public.services (
  id text primary key,
  workspace_id text not null default 'triada-ops',
  name text not null,
  description text not null default '',
  price numeric(12, 2),
  currency text not null default 'AED',
  inquiry_url text,
  status text not null default 'active', -- active|draft|archived
  approved_claims jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists services_workspace_updated_idx
  on public.services (workspace_id, updated_at desc);

create index if not exists services_workspace_status_idx
  on public.services (workspace_id, status);

alter table public.services enable row level security;

comment on table public.services is
  'Triada service offerings (consultation, custom, engraving, etc). Admin CRUD via Next dual-run; no hardcoded catalog.';
