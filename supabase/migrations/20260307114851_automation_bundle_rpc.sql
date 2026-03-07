create or replace function public.replace_automation_children(
  p_automation_id uuid,
  p_rules jsonb,
  p_actions jsonb
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_rule jsonb;
  v_action jsonb;
  v_pattern text;
  v_flags text;
  v_action_type text;
  v_template text;
begin
  if p_rules is null or jsonb_typeof(p_rules) <> 'array' then
    raise exception 'rules must be an array';
  end if;

  if p_actions is null or jsonb_typeof(p_actions) <> 'array' then
    raise exception 'actions must be an array';
  end if;

  delete from public.automation_rules where automation_id = p_automation_id;
  delete from public.automation_actions where automation_id = p_automation_id;

  for v_rule in select value from jsonb_array_elements(p_rules)
  loop
    v_pattern := nullif(btrim(coalesce(v_rule ->> 'pattern', '')), '');
    v_flags := nullif(btrim(coalesce(v_rule ->> 'flags', '')), '');

    if v_pattern is null then
      raise exception 'Rule pattern is required';
    end if;

    insert into public.automation_rules (automation_id, pattern, flags)
    values (p_automation_id, v_pattern, v_flags);
  end loop;

  for v_action in select value from jsonb_array_elements(p_actions)
  loop
    v_action_type := nullif(btrim(coalesce(v_action ->> 'type', '')), '');
    v_template := nullif(btrim(coalesce(v_action ->> 'template', '')), '');

    if v_action_type not in ('reply', 'dm') then
      raise exception 'Action type must be reply or dm';
    end if;

    if v_template is null then
      raise exception 'Action template is required';
    end if;

    insert into public.automation_actions (automation_id, type, template)
    values (p_automation_id, v_action_type, v_template);
  end loop;
end;
$$;

create or replace function public.create_automation_bundle(
  p_connection_id uuid,
  p_ig_post_id text,
  p_name text default null,
  p_enabled boolean default true,
  p_rules jsonb default '[]'::jsonb,
  p_actions jsonb default '[]'::jsonb
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

  insert into public.automations (owner_user_id, connection_id, ig_post_id, name, enabled)
  values (v_owner_user_id, p_connection_id, v_ig_post_id, v_name, v_enabled)
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
  p_actions jsonb default null
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
      enabled = v_next_enabled
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
            jsonb_build_object('type', a.type, 'template', a.template)
            order by a.created_at asc
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

revoke all on function public.replace_automation_children(uuid, jsonb, jsonb) from public;
revoke all on function public.replace_automation_children(uuid, jsonb, jsonb) from anon;
revoke all on function public.replace_automation_children(uuid, jsonb, jsonb) from authenticated;

grant execute on function public.replace_automation_children(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.create_automation_bundle(uuid, text, text, boolean, jsonb, jsonb) to authenticated;
grant execute on function public.update_automation_bundle(uuid, text, boolean, boolean, jsonb, jsonb) to authenticated;
