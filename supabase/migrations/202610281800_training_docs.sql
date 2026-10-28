-- AI agent training docs (tone, timing, conversation open/close).
-- Text store for RAG-style retrieval; optional files in Storage bucket training-docs.

create table if not exists public.training_docs (
  id text primary key,
  workspace_id text not null default 'triada-ops',
  title text not null,
  category text not null default 'general',
  body text not null default '',
  tags jsonb not null default '[]'::jsonb,
  status text not null default 'published',
  source text not null default 'upload',
  filename text,
  storage_path text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists training_docs_workspace_updated_idx
  on public.training_docs (workspace_id, updated_at desc);

create index if not exists training_docs_workspace_category_idx
  on public.training_docs (workspace_id, category);

create index if not exists training_docs_workspace_status_idx
  on public.training_docs (workspace_id, status);

alter table public.training_docs enable row level security;

comment on table public.training_docs is
  'Admin-uploaded training docs for Triada AI agents (tone / timing / open-close). Retrieved into Anthropic prompts; never fabricate off-brand words.';

-- Optional: create a private Storage bucket named `training-docs` in the Supabase dashboard
-- for original .txt/.md uploads. Text bodies still live in training_docs.body for RAG.
