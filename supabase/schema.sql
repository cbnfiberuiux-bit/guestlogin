-- Run in Supabase Dashboard → SQL Editor. Safe to re-run (also upgrades the first version).

create or replace function public.gen_guest_code() returns text
language sql volatile set search_path = '' as $$
  select 'CBN-' || string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, 7)
$$;

create table if not exists public.guests (
  id uuid primary key default gen_random_uuid(),
  code text unique not null default public.gen_guest_code(),
  name text not null,
  company text,
  tier text not null default 'REGULAR' check (tier in ('VIP', 'REGULAR')),
  table_no text,
  checked_in_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.guests add column if not exists checked_in_at timestamptz;
alter table public.guests alter column code set default public.gen_guest_code();
update public.guests set code = upper(code) where code <> upper(code);

-- Only emails listed here can use the app (an Auth account alone grants nothing).
create table if not exists public.admins (email text primary key);

alter table public.guests enable row level security;
alter table public.admins enable row level security;

drop policy if exists "admins manage guests" on public.guests;
create policy "admins manage guests" on public.guests for all to authenticated
  using (exists (select 1 from public.admins a where a.email = (select auth.jwt() ->> 'email')))
  with check (exists (select 1 from public.admins a where a.email = (select auth.jwt() ->> 'email')));

drop policy if exists "read own admin row" on public.admins;
create policy "read own admin row" on public.admins for select to authenticated
  using (email = (select auth.jwt() ->> 'email'));

-- Atomic check-in: first scan → 'ok', later scans → 'again', unknown code → no row.
create or replace function public.check_in(p_code text)
returns table (id uuid, code text, name text, company text, tier text, table_no text, checked_in_at timestamptz, status text)
language plpgsql security invoker set search_path = '' as $$
#variable_conflict use_column
begin
  return query update public.guests g set checked_in_at = now()
    where g.code = upper(trim(p_code)) and g.checked_in_at is null
    returning g.id, g.code, g.name, g.company, g.tier, g.table_no, g.checked_in_at, 'ok'::text;
  if not found then
    return query select g.id, g.code, g.name, g.company, g.tier, g.table_no, g.checked_in_at, 'again'::text
      from public.guests g where g.code = upper(trim(p_code));
  end if;
end $$;

revoke all on function public.check_in(text) from public, anon;
grant execute on function public.check_in(text) to authenticated;

-- The first version exposed a public lookup screen; tickets are now checked in by staff only.
drop function if exists public.get_guest(text);

-- Make every Auth user an admin (run again after adding staff accounts):
insert into public.admins (email) select email from auth.users on conflict do nothing;
