alter table public.automation_actions
  add column if not exists use_ai boolean not null default false;

alter table public.automation_executions
  add column if not exists message_text text,
  add column if not exists message_source text,
  add column if not exists ai_error text,
  add column if not exists ai_model text,
  add column if not exists ai_prompt_version text,
  add column if not exists ai_latency_ms integer;

alter table public.automation_executions
  add constraint automation_executions_message_source_check
  check (message_source is null or message_source in ('template', 'ai'));

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
  v_use_ai boolean;
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
    v_use_ai := coalesce((v_action ->> 'use_ai')::boolean, (v_action ->> 'useAi')::boolean, false);

    if v_action_type not in ('reply', 'dm') then
      raise exception 'Action type must be reply or dm';
    end if;

    if v_template is null then
      raise exception 'Action template is required';
    end if;

    insert into public.automation_actions (automation_id, type, template, use_ai)
    values (p_automation_id, v_action_type, v_template, v_use_ai);
  end loop;
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
            jsonb_build_object('type', a.type, 'template', a.template, 'use_ai', a.use_ai)
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
