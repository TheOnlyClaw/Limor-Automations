create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create policy "webhook_events_no_direct_access"
on public.instagram_webhook_events
for all
to authenticated
using (false)
with check (false);
