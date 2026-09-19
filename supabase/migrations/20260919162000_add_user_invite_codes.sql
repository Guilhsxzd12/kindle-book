create table if not exists public.user_invite_codes (
  code_hash text primary key,
  plan_type text not null check (plan_type in ('monthly','lifetime')),
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.user_invite_codes enable row level security;
revoke all on table public.user_invite_codes from anon, authenticated;
grant all on table public.user_invite_codes to service_role;
create index if not exists user_invite_codes_expires_at_idx on public.user_invite_codes (expires_at);
create index if not exists user_invite_codes_used_at_idx on public.user_invite_codes (used_at);

create index if not exists user_invite_codes_created_by_idx on public.user_invite_codes (created_by);
create index if not exists user_invite_codes_used_by_idx on public.user_invite_codes (used_by);
