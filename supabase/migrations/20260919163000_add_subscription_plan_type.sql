alter table public.subscriptions
  add column if not exists plan_type text not null default 'monthly';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'subscriptions_plan_type_check'
      and conrelid = 'public.subscriptions'::regclass
  ) then
    alter table public.subscriptions
      add constraint subscriptions_plan_type_check
      check (plan_type in ('monthly','lifetime'));
  end if;
end $$;

update public.subscriptions
set plan_type='lifetime'
where active_until >= timestamptz '9999-01-01 00:00:00+00'
   or note ilike '%vitalício%';
