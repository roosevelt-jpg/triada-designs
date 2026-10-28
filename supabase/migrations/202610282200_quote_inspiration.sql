-- Quote / Inspiration engine settings (weekday broadcast prefs).
-- Next dual-run also persists locally under .triada-local when Supabase is unset.

create table if not exists public.quote_inspiration_settings (
  workspace_id text primary key default 'triada-ops',
  enabled boolean not null default true,
  weekdays integer[] not null default '{1,3,5}',
  send_hour_utc integer not null default 10,
  send_minute_utc integer not null default 0,
  timezone text not null default 'UTC',
  channel text not null default 'whatsapp',
  template_name text not null default 'triada_inspiration_share',
  language text not null default 'en',
  theme text not null default 'quiet luxury jewellery',
  campaign_key text not null default 'inspiration',
  contact_ids text[] not null default '{}',
  recipient_limit integer not null default 50,
  require_approval boolean not null default true,
  auto_schedule_next boolean not null default true,
  last_run_at timestamptz,
  last_broadcast_at timestamptz,
  last_content_id text,
  updated_at timestamptz not null default now()
);

create table if not exists public.quote_inspiration_history (
  id text primary key,
  workspace_id text not null default 'triada-ops',
  content_id text,
  quote text not null,
  attribution text,
  caption text,
  theme text,
  status text not null default 'draft',
  card_url text,
  scheduled_for timestamptz,
  weekday integer,
  broadcast jsonb,
  training_doc_ids text[] default '{}',
  created_at timestamptz not null default now()
);

create index if not exists quote_inspiration_history_ws_created_idx
  on public.quote_inspiration_history (workspace_id, created_at desc);

insert into public.quote_inspiration_settings (workspace_id)
values ('triada-ops')
on conflict (workspace_id) do nothing;
