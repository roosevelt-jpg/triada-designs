-- CRM contacts for Next dual-run (CSV/Excel upload + WhatsApp campaign recipients).
-- Service-role writes from Next Route Handlers. E.164 phones in phone_e164 / phone_normalized.

create table if not exists public.crm_contacts (
  id text primary key,
  workspace_id text not null default 'triada-ops',
  name text,
  email text,
  email_normalized text,
  phone text,
  phone_e164 text,
  phone_normalized text,
  phone_valid boolean not null default false,
  whatsapp_ready boolean not null default false,
  preferred_language text not null default 'en',
  lifecycle_status text not null default 'lead',
  source text not null default 'manual',
  marketing_opt_out boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_contacts_workspace_updated_idx
  on public.crm_contacts (workspace_id, updated_at desc);

create index if not exists crm_contacts_workspace_phone_idx
  on public.crm_contacts (workspace_id, phone_normalized);

create index if not exists crm_contacts_workspace_email_idx
  on public.crm_contacts (workspace_id, email_normalized);

create index if not exists crm_contacts_whatsapp_ready_idx
  on public.crm_contacts (workspace_id, whatsapp_ready)
  where whatsapp_ready = true;

alter table public.crm_contacts enable row level security;

comment on table public.crm_contacts is
  'Triada CRM contacts (Next dual-run). Phones stored E.164 for WhatsApp Cloud campaign sends.';
