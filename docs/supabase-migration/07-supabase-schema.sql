-- Implementation-ready draft schema for Supabase project:
-- Project: Limor-Automations (dpfbbodkvgtojrffmcaf)
-- Status when drafted: empty public schema

create extension if not exists pgcrypto with schema extensions;

create schema if not exists app_private;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists app_private.meta_apps (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  mode text not null check (mode in ('shared', 'user_owned')),
  meta_app_id text,
  meta_app_secret text,
  webhook_verify_token text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.instagram_connections (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  label text,
  meta_app_id uuid references app_private.meta_apps(id) on delete set null,
  access_token text not null,
  ig_user_id text,
  page_id text,
  token_expires_at timestamptz,
  last_refreshed_at timestamptz,
  refresh_status text,
  refresh_error text,
  connection_status text not null default 'active' check (connection_status in ('active', 'reauth_required', 'disabled')),
  last_posts_sync_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_instagram_connections_owner on public.instagram_connections(owner_user_id);
create index if not exists idx_instagram_connections_ig_user on public.instagram_connections(ig_user_id);

create table if not exists public.instagram_posts (
  connection_id uuid not null references public.instagram_connections(id) on delete cascade,
  id text not null,
  caption text,
  media_type text not null,
  media_url text,
  thumbnail_url text,
  permalink text,
  posted_at timestamptz,
  raw_json jsonb,
  synced_at timestamptz not null default timezone('utc', now()),
  primary key (connection_id, id)
);

create index if not exists idx_instagram_posts_connection_sync on public.instagram_posts(connection_id, synced_at desc);

create table if not exists public.automations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.instagram_connections(id) on delete cascade,
  ig_post_id text not null,
  name text,
  enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (connection_id, ig_post_id)
);

create index if not exists idx_automations_owner on public.automations(owner_user_id);
create index if not exists idx_automations_connection on public.automations(connection_id);

create table if not exists public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations(id) on delete cascade,
  pattern text not null,
  flags text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_automation_rules_automation on public.automation_rules(automation_id);

create table if not exists public.automation_actions (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations(id) on delete cascade,
  type text not null check (type in ('reply', 'dm')),
  template text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_automation_actions_automation on public.automation_actions(automation_id);

create table if not exists public.instagram_webhook_events (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid references public.instagram_connections(id) on delete cascade,
  meta_app_id uuid references app_private.meta_apps(id) on delete set null,
  dedupe_key text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'processed', 'failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz,
  locked_at timestamptz,
  locked_by text,
  processed_at timestamptz,
  last_error text,
  received_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists uq_instagram_webhook_events_connection_dedupe
  on public.instagram_webhook_events(connection_id, dedupe_key);

create index if not exists idx_instagram_webhook_events_due
  on public.instagram_webhook_events(status, next_attempt_at, received_at);

create table if not exists public.automation_executions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.instagram_webhook_events(id) on delete cascade,
  automation_id uuid not null references public.automations(id) on delete cascade,
  action_type text not null check (action_type in ('reply', 'dm')),
  status text not null check (status in ('queued', 'skipped', 'succeeded', 'failed')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (event_id, automation_id, action_type)
);

create index if not exists idx_automation_executions_automation on public.automation_executions(automation_id, created_at desc);
create index if not exists idx_automation_executions_event on public.automation_executions(event_id);

create or replace view public.instagram_connections_safe as
select
  id,
  owner_user_id,
  label,
  meta_app_id,
  ig_user_id,
  page_id,
  token_expires_at,
  last_refreshed_at,
  refresh_status,
  refresh_error,
  connection_status,
  last_posts_sync_at,
  created_at,
  updated_at,
  true as has_stored_access_token
from public.instagram_connections;

alter table public.profiles enable row level security;
alter table public.instagram_connections enable row level security;
alter table public.instagram_posts enable row level security;
alter table public.automations enable row level security;
alter table public.automation_rules enable row level security;
alter table public.automation_actions enable row level security;
alter table public.instagram_webhook_events enable row level security;
alter table public.automation_executions enable row level security;

create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check ((select auth.uid()) = id);

create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "connections_select_own"
on public.instagram_connections
for select
to authenticated
using ((select auth.uid()) = owner_user_id);

create policy "connections_insert_own"
on public.instagram_connections
for insert
to authenticated
with check ((select auth.uid()) = owner_user_id);

create policy "connections_update_own"
on public.instagram_connections
for update
to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

create policy "connections_delete_own"
on public.instagram_connections
for delete
to authenticated
using ((select auth.uid()) = owner_user_id);

create policy "posts_select_via_connection_owner"
on public.instagram_posts
for select
to authenticated
using (
  exists (
    select 1
    from public.instagram_connections c
    where c.id = instagram_posts.connection_id
      and c.owner_user_id = (select auth.uid())
  )
);

create policy "posts_write_via_connection_owner"
on public.instagram_posts
for all
to authenticated
using (
  exists (
    select 1
    from public.instagram_connections c
    where c.id = instagram_posts.connection_id
      and c.owner_user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.instagram_connections c
    where c.id = instagram_posts.connection_id
      and c.owner_user_id = (select auth.uid())
  )
);

create policy "automations_all_own"
on public.automations
for all
to authenticated
using ((select auth.uid()) = owner_user_id)
with check ((select auth.uid()) = owner_user_id);

create policy "automation_rules_via_automation_owner"
on public.automation_rules
for all
to authenticated
using (
  exists (
    select 1 from public.automations a
    where a.id = automation_rules.automation_id
      and a.owner_user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.automations a
    where a.id = automation_rules.automation_id
      and a.owner_user_id = (select auth.uid())
  )
);

create policy "automation_actions_via_automation_owner"
on public.automation_actions
for all
to authenticated
using (
  exists (
    select 1 from public.automations a
    where a.id = automation_actions.automation_id
      and a.owner_user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.automations a
    where a.id = automation_actions.automation_id
      and a.owner_user_id = (select auth.uid())
  )
);

create policy "webhook_events_select_own"
on public.instagram_webhook_events
for select
to authenticated
using ((select auth.uid()) = owner_user_id);

create policy "executions_select_own"
on public.automation_executions
for select
to authenticated
using ((select auth.uid()) = owner_user_id);

create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger set_meta_apps_updated_at
before update on app_private.meta_apps
for each row execute function public.set_updated_at();

create trigger set_instagram_connections_updated_at
before update on public.instagram_connections
for each row execute function public.set_updated_at();

create trigger set_automations_updated_at
before update on public.automations
for each row execute function public.set_updated_at();

create trigger set_automation_executions_updated_at
before update on public.automation_executions
for each row execute function public.set_updated_at();

-- Notes:
-- 1. app_private tables should only be accessed with the service role from Edge Functions.
-- 2. access_token/meta_app_secret/webhook_verify_token should be encrypted before storage.
-- 3. expose instagram_connections_safe to the browser instead of reading instagram_connections directly if you want an extra safety layer.
