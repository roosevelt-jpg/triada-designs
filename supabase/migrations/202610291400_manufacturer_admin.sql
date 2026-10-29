-- Manufacturer admin control (Next + Supabase).
-- Contacts directory, durable commerce orders, manufacturer jobs with ack/status.
-- Delivery modes are channel-honest (email|whatsapp|awaiting_credentials|recorded) — never local_sim.

create table if not exists public.manufacturer_contacts (
  id text primary key,
  workspace_id text not null default 'triada-ops',
  name text not null,
  company text,
  email text,
  phone text,
  phone_e164 text,
  preferred_channel text not null default 'email', -- email|whatsapp
  is_primary boolean not null default false,
  notes text,
  status text not null default 'active', -- active|inactive
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists manufacturer_contacts_workspace_updated_idx
  on public.manufacturer_contacts (workspace_id, updated_at desc);

create index if not exists manufacturer_contacts_workspace_primary_idx
  on public.manufacturer_contacts (workspace_id, is_primary)
  where is_primary = true;

alter table public.manufacturer_contacts enable row level security;

comment on table public.manufacturer_contacts is
  'Factory / manufacturer vendor contacts for admin order placement (email/WhatsApp).';

create table if not exists public.manufacturer_materials (
  id text primary key,
  workspace_id text not null default 'triada-ops',
  material_key text not null,
  display_name text not null,
  unit text not null default 'g',
  metal_price_per_gram numeric(12, 4),
  making_charge_per_gram numeric(12, 4),
  stock_grams numeric(12, 3),
  low_stock_threshold_grams numeric(12, 3),
  currency text not null default 'AED',
  price_as_of timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, material_key)
);

create index if not exists manufacturer_materials_workspace_idx
  on public.manufacturer_materials (workspace_id, display_name);

alter table public.manufacturer_materials enable row level security;

comment on table public.manufacturer_materials is
  'Manufacturer metal catalog with $/g, making charge, and stock for cost/profit.';

create table if not exists public.commerce_orders (
  id text primary key,
  workspace_id text not null default 'triada-ops',
  order_number text not null,
  external_ref text,
  channel text not null default 'dashboard',
  lifecycle_status text not null default 'confirmed',
  currency text not null default 'AED',
  subtotal numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  cost_total numeric(12, 2),
  profit numeric(12, 2),
  paid boolean not null default false,
  whatsapp_opt_in boolean not null default false,
  customer_name text,
  customer_phone text,
  customer_email text,
  tracking_number text,
  tracking_url text,
  line_items jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  confirmed_at timestamptz,
  in_production_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, order_number)
);

create index if not exists commerce_orders_workspace_updated_idx
  on public.commerce_orders (workspace_id, updated_at desc);

alter table public.commerce_orders enable row level security;

comment on table public.commerce_orders is
  'Paid commerce orders created from admin /orders (Next dual-run).';

create table if not exists public.manufacturer_orders (
  id text primary key,
  workspace_id text not null default 'triada-ops',
  commerce_order_id text,
  manufacturer_contact_id text,
  external_ref text,
  status text not null default 'queued',
  -- queued|sent|acknowledged|accepted|in_production|ready|shipped|cancelled
  piece text,
  sku text,
  size text,
  metal text,
  engraving text,
  cost numeric(12, 2),
  sell_price numeric(12, 2),
  profit numeric(12, 2),
  delivery_mode text not null default 'awaiting_credentials',
  -- email|whatsapp|awaiting_credentials|recorded — never local_sim
  provider_message_id text,
  payload jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  acked_at timestamptz,
  acked_by text,
  status_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists manufacturer_orders_workspace_updated_idx
  on public.manufacturer_orders (workspace_id, updated_at desc);

create index if not exists manufacturer_orders_workspace_status_idx
  on public.manufacturer_orders (workspace_id, status, updated_at desc);

create index if not exists manufacturer_orders_commerce_idx
  on public.manufacturer_orders (workspace_id, commerce_order_id);

alter table public.manufacturer_orders enable row level security;

comment on table public.manufacturer_orders is
  'Durable manufacturer job records with outbound delivery + admin ack/status tracking.';
