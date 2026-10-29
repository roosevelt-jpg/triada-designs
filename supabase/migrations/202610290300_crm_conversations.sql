-- Unified Inbox conversations + nested message trails (Next dual-run).
-- Service-role writes from webhook ingest / Support auto-reply / admin replies.
-- Messages stored as jsonb on the conversation row (matches ConversationRecord).

create table if not exists public.crm_conversations (
  id text primary key,
  workspace_id text not null default 'triada-ops',
  channel text not null,
  status text not null default 'open',
  automation_mode text not null default 'ai',
  subject text not null default '',
  contact_id text,
  assigned_agent_key text,
  external_user_id text,
  external_conversation_id text,
  page_or_account_id text,
  provider_message_ids jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  last_inbound_body text,
  last_outbound_body text,
  unanswered boolean not null default true,
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_conversations_workspace_updated_idx
  on public.crm_conversations (workspace_id, updated_at desc);

create index if not exists crm_conversations_workspace_channel_idx
  on public.crm_conversations (workspace_id, channel);

create index if not exists crm_conversations_external_conv_idx
  on public.crm_conversations (workspace_id, channel, external_conversation_id);

create index if not exists crm_conversations_external_user_idx
  on public.crm_conversations (workspace_id, channel, external_user_id)
  where status = 'open';

create index if not exists crm_conversations_contact_idx
  on public.crm_conversations (workspace_id, contact_id)
  where contact_id is not null;

alter table public.crm_conversations enable row level security;

comment on table public.crm_conversations is
  'Triada Unified Inbox conversations (Next dual-run). Webhook → Support trails persist here so /inbox works across Vercel instances.';
