-- Team invites, roles, and memberships for Triada ops dashboard.
-- Service-role writes from Next dual-run; RLS enabled with no anon policies.

create table if not exists public.team_roles (
  id text primary key,
  workspace_id text not null default 'triada-ops',
  slug text not null,
  name text not null,
  description text not null default '',
  is_system boolean not null default false,
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);

create index if not exists team_roles_workspace_idx
  on public.team_roles (workspace_id, name);

create table if not exists public.team_members (
  id text primary key,
  workspace_id text not null default 'triada-ops',
  user_id text,
  email text not null,
  name text not null default '',
  phone text not null default '',
  role_title text not null default '',
  role_id text not null references public.team_roles (id),
  role_slug text not null default '',
  status text not null default 'active',
  permissions_override jsonb,
  profile_completed boolean not null default false,
  last_login_at timestamptz,
  invited_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists team_members_workspace_email_idx
  on public.team_members (workspace_id, email);

create index if not exists team_members_user_id_idx
  on public.team_members (user_id);

create index if not exists team_members_status_idx
  on public.team_members (workspace_id, status);

create table if not exists public.team_invites (
  id text primary key,
  workspace_id text not null default 'triada-ops',
  email text not null,
  name text not null default '',
  role_id text not null references public.team_roles (id),
  role_slug text not null default '',
  token_hash text not null unique,
  status text not null default 'pending',
  invited_by text,
  invited_by_email text,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists team_invites_workspace_status_idx
  on public.team_invites (workspace_id, status, created_at desc);

create index if not exists team_invites_email_idx
  on public.team_invites (workspace_id, email);

alter table public.team_roles enable row level security;
alter table public.team_members enable row level security;
alter table public.team_invites enable row level security;

comment on table public.team_roles is
  'Ops dashboard roles with fine-grained area permissions (view/manage).';
comment on table public.team_members is
  'Active and historical workspace memberships linked to Supabase Auth users.';
comment on table public.team_invites is
  'Pending team invitations; token stored hashed; branded email via Resend.';
