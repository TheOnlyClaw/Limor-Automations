-- Add a durable switch for whether DM media should be sent, while allowing
-- media fields to remain stored (for UX "remember last upload" behavior).

alter table public.automation_actions
  add column if not exists media_enabled boolean;

-- Backfill: if we have media configured, default to enabled.
update public.automation_actions
set media_enabled = true
where media_enabled is null
  and media_kind is not null;

-- Otherwise default to disabled.
update public.automation_actions
set media_enabled = false
where media_enabled is null;

alter table public.automation_actions
  alter column media_enabled set default false,
  alter column media_enabled set not null;

-- Replace the old "all-or-nothing" consistency constraint with one that
-- allows storing media bucket/path even when disabled.
alter table public.automation_actions
  drop constraint if exists automation_actions_media_fields_consistency;

alter table public.automation_actions
  add constraint automation_actions_media_fields_consistency
  check (
    -- No media saved at all.
    (media_kind is null and media_bucket is null and media_path is null)
    or
    -- Media saved (kind+bucket+path must be consistent), regardless of enabled state.
    (media_kind is not null and media_bucket is not null and media_path is not null)
  );

-- Enforce that media_enabled can't be true unless media exists.
alter table public.automation_actions
  drop constraint if exists automation_actions_media_enabled_requires_media;

alter table public.automation_actions
  add constraint automation_actions_media_enabled_requires_media
  check (
    (media_enabled = false)
    or
    (media_enabled = true and media_kind is not null and media_bucket is not null and media_path is not null)
  );

-- Extend RPCs to persist media_enabled.
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
  v_action_ordinality integer;
  v_pattern text;
  v_flags text;
  v_action_type text;
  v_template text;
  v_use_ai boolean;
  v_sort_order integer;
  v_cta_text text;
  v_media_kind text;
  v_media_bucket text;
  v_media_path text;
  v_caption text;
  v_media_enabled boolean;
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

  for v_action, v_action_ordinality in
    select value, ordinality from jsonb_array_elements(p_actions) with ordinality
  loop
    v_action_type := nullif(btrim(coalesce(v_action ->> 'type', '')), '');
    v_template := nullif(btrim(coalesce(v_action ->> 'template', '')), '');
    v_use_ai := coalesce((v_action ->> 'use_ai')::boolean, (v_action ->> 'useAi')::boolean, false);
    v_cta_text := nullif(btrim(coalesce(v_action ->> 'cta_text', v_action ->> 'ctaText', '')), '');
    v_media_kind := nullif(btrim(coalesce(v_action ->> 'media_kind', v_action ->> 'mediaKind', '')), '');
    v_media_bucket := nullif(btrim(coalesce(v_action ->> 'media_bucket', v_action ->> 'mediaBucket', '')), '');
    v_media_path := nullif(btrim(coalesce(v_action ->> 'media_path', v_action ->> 'mediaPath', '')), '');
    v_caption := nullif(btrim(coalesce(v_action ->> 'caption', '')), '');
    v_media_enabled := coalesce(
      (v_action ->> 'media_enabled')::boolean,
      (v_action ->> 'mediaEnabled')::boolean,
      -- Backward compatible default: if media exists, enable it.
      (v_media_kind is not null and v_media_bucket is not null and v_media_path is not null)
    );

    v_sort_order := v_action_ordinality - 1;

    if v_action_type not in ('reply', 'dm') then
      raise exception 'Action type must be reply or dm';
    end if;

    if v_template is null then
      raise exception 'Action template is required';
    end if;

    insert into public.automation_actions (
      automation_id,
      type,
      template,
      use_ai,
      sort_order,
      cta_text,
      media_kind,
      media_bucket,
      media_path,
      caption,
      media_enabled
    )
    values (
      p_automation_id,
      v_action_type,
      v_template,
      v_use_ai,
      v_sort_order,
      v_cta_text,
      v_media_kind,
      v_media_bucket,
      v_media_path,
      v_caption,
      v_media_enabled
    );
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
            jsonb_build_object(
              'type', a.type,
              'template', a.template,
              'use_ai', a.use_ai,
              'cta_text', a.cta_text,
              'media_kind', a.media_kind,
              'media_bucket', a.media_bucket,
              'media_path', a.media_path,
              'caption', a.caption,
              'media_enabled', a.media_enabled
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
