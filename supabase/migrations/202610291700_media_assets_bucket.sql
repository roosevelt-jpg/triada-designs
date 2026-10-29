-- Media assets for dashboard direct file uploads (no image URL paste).
-- Create a Storage bucket named `media-assets` in the Supabase dashboard
-- (public read recommended so Meta can fetch media_url / media_link when needed).
-- Server uploads use the service role; object paths:
--   triada-ops/{folder}/{id}-{filename}
-- WhatsApp / Meta Graph approval rules are enforced in the Next.js upload API:
--   images JPEG/PNG ≤ 5 MB; video MP4/3GP ≤ 16 MB.
--
-- Optional metadata mirror (safe if bucket is created later):

create table if not exists public.media_assets (
  id text primary key,
  workspace_id text not null default 'triada-ops',
  filename text not null,
  mime_type text not null,
  media_type text not null default 'image',
  size_bytes bigint not null default 0,
  storage_path text,
  public_url text,
  purpose text not null default 'whatsapp',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists media_assets_workspace_created_idx
  on public.media_assets (workspace_id, created_at desc);

alter table public.media_assets enable row level security;

comment on table public.media_assets is
  'Optional index of admin-uploaded media files stored in the media-assets Storage bucket.';
