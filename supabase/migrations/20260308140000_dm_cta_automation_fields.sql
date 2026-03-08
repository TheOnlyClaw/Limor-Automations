alter table public.automations
  add column if not exists dm_cta_text text,
  add column if not exists dm_cta_greeting text,
  add column if not exists dm_cta_enabled boolean not null default false;

with dm_counts as (
  select
    automation_id,
    count(*) filter (where type = 'dm') as dm_count
  from public.automation_actions
  group by automation_id
)
update public.automations a
set dm_cta_enabled = true,
    dm_cta_text = coalesce(a.dm_cta_text, 'Send me the rest'),
    dm_cta_greeting = coalesce(a.dm_cta_greeting, 'Thanks for your comment! Tap below to receive the messages.')
from dm_counts d
where a.id = d.automation_id
  and d.dm_count > 1;

create unique index if not exists uq_automation_cta_sessions_event_automation
  on public.automation_cta_sessions(event_id, automation_id);

create or replace function public.create_automation_bundle(
  p_connection_id uuid,
  p_ig_post_id text,
  p_name text default null,
  p_enabled boolean default true,
  p_rules jsonb default '[]'::jsonb,
  p_actions jsonb default '[]'::jsonb,
  p_dm_cta_text text default null,
  p_dm_cta_greeting text default null,
  p_dm_cta_enabled boolean default false
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_owner_user_id uuid := auth.uid();
  v_automation_id uuid;
  v_ig_post_id text := nullif(btrim(coalesce(p_ig_post_id, '')), '');
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_enabled boolean := coalesce(p_enabled, true);
  v_rules jsonb := coalesce(p_rules, '[]'::jsonb);
  v_actions jsonb := coalesce(p_actions, '[]'::jsonb);
  v_dm_cta_text text := nullif(btrim(coalesce(p_dm_cta_text, '')), '');
  v_dm_cta_greeting text := nullif(btrim(coalesce(p_dm_cta_greeting, '')), '');
  v_dm_cta_enabled boolean := coalesce(p_dm_cta_enabled, false);
begin
  if v_owner_user_id is null then
    raise exception 'Unauthorized';
  end if;

  if v_ig_post_id is null then
    raise exception 'igPostId is required';
  end if;

  if not exists (
    select 1
    from public.instagram_connections c
    where c.id = p_connection_id
      and c.owner_user_id = v_owner_user_id
  ) then
    raise exception 'Connection not found';
  end if;

  if jsonb_typeof(v_rules) <> 'array' then
    raise exception 'rules must be an array';
  end if;

  if jsonb_typeof(v_actions) <> 'array' then
    raise exception 'actions must be an array';
  end if;

  if v_enabled and jsonb_array_length(v_rules) = 0 then
    raise exception 'At least one rule is required when enabled';
  end if;

  insert into public.automations (
    owner_user_id,
    connection_id,
    ig_post_id,
    name,
    enabled,
    dm_cta_text,
    dm_cta_greeting,
    dm_cta_enabled
  )
  values (
    v_owner_user_id,
    p_connection_id,
    v_ig_post_id,
    v_name,
    v_enabled,
    v_dm_cta_text,
    v_dm_cta_greeting,
    v_dm_cta_enabled
  )
  returning id into v_automation_id;

  perform public.replace_automation_children(v_automation_id, v_rules, v_actions);

  return v_automation_id;
exception
  when unique_violation then
    raise exception 'Automation already exists for this connection and post';
end;
$$;

create or replace function public.update_automation_bundle(
  p_automation_id uuid,
  p_name text default null,
  p_name_is_set boolean default false,
  p_enabled boolean default null,
  p_rules jsonb default null,
  p_actions jsonb default null,
  p_dm_cta_text text default null,
  p_dm_cta_greeting text default null,
  p_dm_cta_enabled boolean default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_owner_user_id uuid := auth.uid();
  v_existing public.automations%rowtype;
  v_next_name text;
  v_next_enabled boolean;
  v_next_rules jsonb;
  v_next_actions jsonb;
  v_effective_rule_count integer;
  v_next_dm_cta_text text;
  v_next_dm_cta_greeting text;
  v_next_dm_cta_enabled boolean;
begin
  if v_owner_user_id is null then
    raise exception 'Unauthorized';
  end if;

  select *
  into v_existing
  from public.automations a
  where a.id = p_automation_id
    and a.owner_user_id = v_owner_user_id;

  if not found then
    raise exception 'Automation not found';
  end if;

  if p_rules is not null and jsonb_typeof(p_rules) <> 'array' then
    raise exception 'rules must be an array';
  end if;

  if p_actions is not null and jsonb_typeof(p_actions) <> 'array' then
    raise exception 'actions must be an array';
  end if;

  v_next_name := case
    when p_name_is_set then nullif(btrim(coalesce(p_name, '')), '')
    else v_existing.name
  end;

  v_next_enabled := coalesce(p_enabled, v_existing.enabled);
  v_next_dm_cta_text := case
    when p_dm_cta_text is null then v_existing.dm_cta_text
    else nullif(btrim(coalesce(p_dm_cta_text, '')), '')
  end;
  v_next_dm_cta_greeting := case
    when p_dm_cta_greeting is null then v_existing.dm_cta_greeting
    else nullif(btrim(coalesce(p_dm_cta_greeting, '')), '')
  end;
  v_next_dm_cta_enabled := coalesce(p_dm_cta_enabled, v_existing.dm_cta_enabled);

  if p_rules is null then
    select count(*)
    into v_effective_rule_count
    from public.automation_rules r
    where r.automation_id = v_existing.id;
  else
    v_effective_rule_count := jsonb_array_length(p_rules);
  end if;

  if v_next_enabled and v_effective_rule_count = 0 then
    raise exception 'At least one rule is required when enabled';
  end if;

  update public.automations
  set name = v_next_name,
      enabled = v_next_enabled,
      dm_cta_text = v_next_dm_cta_text,
      dm_cta_greeting = v_next_dm_cta_greeting,
      dm_cta_enabled = v_next_dm_cta_enabled
  where id = v_existing.id;

  if p_rules is not null or p_actions is not null then
    v_next_rules := coalesce(
      p_rules,
      (
        select coalesce(
          jsonb_agg(
            jsonb_build_object('pattern', r.pattern, 'flags', r.flags)
            order by r.created_at asc
          ),
          '[]'::jsonb
        )
        from public.automation_rules r
        where r.automation_id = v_existing.id
      )
    );

    v_next_actions := coalesce(
      p_actions,
      (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'type', a.type,
              'template', a.template,
              'use_ai', a.use_ai,
              'cta_text', a.cta_text
            )
            order by a.sort_order asc, a.created_at asc
          ),
          '[]'::jsonb
        )
        from public.automation_actions a
        where a.automation_id = v_existing.id
      )
    );

    perform public.replace_automation_children(v_existing.id, v_next_rules, v_next_actions);
  end if;

  return v_existing.id;
end;
$$;

revoke all on function public.create_automation_bundle(uuid, text, text, boolean, jsonb, jsonb, text, text, boolean) from public;
revoke all on function public.create_automation_bundle(uuid, text, text, boolean, jsonb, jsonb, text, text, boolean) from anon;
revoke all on function public.create_automation_bundle(uuid, text, text, boolean, jsonb, jsonb, text, text, boolean) from authenticated;

revoke all on function public.update_automation_bundle(uuid, text, boolean, boolean, jsonb, jsonb, text, text, boolean) from public;
revoke all on function public.update_automation_bundle(uuid, text, boolean, boolean, jsonb, jsonb, text, text, boolean) from anon;
revoke all on function public.update_automation_bundle(uuid, text, boolean, boolean, jsonb, jsonb, text, text, boolean) from authenticated;

grant execute on function public.create_automation_bundle(uuid, text, text, boolean, jsonb, jsonb, text, text, boolean) to authenticated;
grant execute on function public.update_automation_bundle(uuid, text, boolean, boolean, jsonb, jsonb, text, text, boolean) to authenticated;
