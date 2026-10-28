-- Admin-editable invoice / receipt content (plain-text fields).
-- Brand chrome (logo header, address footer, warm greetings) stays in app code.

create table if not exists public.invoice_docs (
  id text primary key,
  workspace_id text not null default 'triada-ops',
  document_type text not null default 'invoice',
  number text not null,
  order_id text,
  customer_name text not null default '',
  customer_email text not null default '',
  currency text not null default 'AED',
  total numeric not null default 0,
  status text not null default 'issued',
  issued_at timestamptz not null default now(),
  line_items jsonb not null default '[]'::jsonb,
  notes text not null default '',
  greeting text not null default '',
  prepared_for text not null default '',
  source text not null default 'manual',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists invoice_docs_workspace_updated_idx
  on public.invoice_docs (workspace_id, updated_at desc);

create index if not exists invoice_docs_workspace_number_idx
  on public.invoice_docs (workspace_id, number);

create index if not exists invoice_docs_workspace_status_idx
  on public.invoice_docs (workspace_id, status);

alter table public.invoice_docs enable row level security;

comment on table public.invoice_docs is
  'Admin plain-text editable Triada invoice/receipt content. Logo header, address footer, and warm greeting defaults are applied in wrap-invoice on read.';
