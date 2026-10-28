-- Encrypted integration credentials for Next dual-run (Anthropic first).
-- Service-role writes from Next Route Handlers. Never expose plaintext via RLS.

create table if not exists public.integration_secrets (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null default 'triada-ops',
  provider text not null,
  secret_type text not null default 'api_key',
  ciphertext text not null,
  key_version text not null default 'v1',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider, secret_type)
);

create index if not exists integration_secrets_workspace_provider_idx
  on public.integration_secrets (workspace_id, provider);

alter table public.integration_secrets enable row level security;

-- Service role bypasses RLS. No anon policies: browser must not read secrets.
comment on table public.integration_secrets is
  'Triada encrypted integration credentials (Next dual-run). Ciphertext only; service-role access.';
