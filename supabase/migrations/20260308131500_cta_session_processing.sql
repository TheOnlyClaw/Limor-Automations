alter table public.automation_cta_sessions
  drop constraint if exists automation_cta_sessions_status_check;

alter table public.automation_cta_sessions
  add constraint automation_cta_sessions_status_check
  check (status in ('pending', 'processing', 'completed', 'failed', 'expired'));
