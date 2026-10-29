-- Live catalogs: products, knowledge, leads, content, automations, audit.
-- Empty by default — admin CRUD via Next dual-run; no hardcoded seed rows.
-- Service-role writes from Next Route Handlers.

-- Products
create table if not exists public.products (
  id text primary key,
  workspace_id text not null default 'triada-ops',
  sku text,
  title text not null,
  description text not null default '',
  product_url text,
  price numeric(12, 2),
  currency text not null default 'AED',
  availability_status text not null default 'in_stock_snapshot',
  published_status text not null default 'draft',
  approved_claims jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  channel_sync jsonb not null default '{}'::jsonb,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_workspace_updated_idx
  on public.products (workspace_id, updated_at desc);

alter table public.products enable row level security;

comment on table public.products is
  'Triada product catalog. Admin CRUD via Next; empty by default.';

-- Knowledge sources (FAQs / policies for AI answers)
create table if not exists public.knowledge_sources (
  id text primary key,
  workspace_id text not null default 'triada-ops',
  title text not null,
  source_type text not null default 'faq', -- faq|policy|training_doc
  status text not null default 'published', -- draft|published|archived
  body text not null default '',
  tags jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists knowledge_sources_workspace_updated_idx
  on public.knowledge_sources (workspace_id, updated_at desc);

alter table public.knowledge_sources enable row level security;

comment on table public.knowledge_sources is
  'Admin-owned FAQs and policies. Empty by default; no hardcoded catalog.';

-- CRM leads
create table if not exists public.crm_leads (
  id text primary key,
  workspace_id text not null default 'triada-ops',
  stage text not null default 'new_lead',
  title text not null default '',
  contact_name text,
  contact_email text,
  contact_phone text,
  contact_id text,
  source_channel text,
  score numeric(8, 2),
  estimated_value numeric(12, 2),
  currency text not null default 'AED',
  external_crm_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_leads_workspace_updated_idx
  on public.crm_leads (workspace_id, updated_at desc);

create index if not exists crm_leads_workspace_stage_idx
  on public.crm_leads (workspace_id, stage);

alter table public.crm_leads enable row level security;

comment on table public.crm_leads is
  'Lead pipeline. Admin CRUD via Next; Zoho sync when credentials present.';

-- Content studio / calendar items
create table if not exists public.content_items (
  id text primary key,
  workspace_id text not null default 'triada-ops',
  title text not null default '',
  content_type text not null default 'social_post',
  objective text,
  status text not null default 'draft',
  body text not null default '',
  channel text,
  scheduled_for timestamptz,
  proposed_scheduled_for timestamptz,
  campaign_key text,
  approval_version integer not null default 0,
  approved_by text,
  approved_at timestamptz,
  published_at timestamptz,
  publish_metadata jsonb not null default '{}'::jsonb,
  creative_brief jsonb not null default '{}'::jsonb,
  product_context jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_items_workspace_updated_idx
  on public.content_items (workspace_id, updated_at desc);

create index if not exists content_items_workspace_status_idx
  on public.content_items (workspace_id, status);

alter table public.content_items enable row level security;

comment on table public.content_items is
  'Content Studio / calendar. Empty by default; no seed posts.';

-- Automations / workflows
create table if not exists public.automations (
  id text primary key,
  workspace_id text not null default 'triada-ops',
  name text not null,
  status text not null default 'draft', -- draft|active|inactive
  trigger_type text,
  description text not null default '',
  definition jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists automations_workspace_updated_idx
  on public.automations (workspace_id, updated_at desc);

alter table public.automations enable row level security;

comment on table public.automations is
  'Visual workflow definitions. Empty by default; admin create/edit/delete.';

-- Audit events (append-only)
create table if not exists public.audit_events (
  id text primary key,
  workspace_id text not null default 'triada-ops',
  action text not null,
  actor text,
  entity_type text,
  entity_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_events_workspace_created_idx
  on public.audit_events (workspace_id, created_at desc);

alter table public.audit_events enable row level security;

comment on table public.audit_events is
  'Real mutation audit trail. Empty until events are appended.';
