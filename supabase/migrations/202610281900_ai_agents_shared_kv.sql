-- Multi-agent team: agents, assigned tasks, shared memory/kv

create table if not exists public.ai_agents (
  id text primary key,
  workspace_id text not null default 'triada-ops',
  key text not null,
  name text not null,
  role text not null default 'custom',
  description text not null default '',
  status text not null default 'active',
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, key)
);

create table if not exists public.ai_agent_tasks (
  id text primary key,
  workspace_id text not null default 'triada-ops',
  agent_id text not null,
  agent_key text not null,
  title text not null,
  description text not null default '',
  status text not null default 'open',
  priority text not null default 'normal',
  context_keys jsonb not null default '[]'::jsonb,
  created_by text not null default 'admin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_agent_tasks_agent_idx
  on public.ai_agent_tasks (workspace_id, agent_id);

create table if not exists public.agent_shared_kv (
  workspace_id text not null default 'triada-ops',
  key text not null,
  value jsonb,
  written_by text,
  tags jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, key)
);

create index if not exists agent_shared_kv_updated_idx
  on public.agent_shared_kv (workspace_id, updated_at desc);
