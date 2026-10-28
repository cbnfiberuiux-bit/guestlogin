-- Run once in Supabase Dashboard → SQL Editor.
create table if not exists public.guests (
  id uuid primary key default gen_random_uuid(),
  code text unique not null default left(replace(gen_random_uuid()::text, '-', ''), 12),
  name text not null,
  company text,
  tier text not null default 'REGULAR' check (tier in ('VIP', 'REGULAR')),
  table_no text,
  created_at timestamptz not null default now()
);

-- Only emails listed here can manage guests (Auth signup alone grants nothing).
create table if not exists public.admins (email text primary key);

alter table public.guests enable row level security;
alter table public.admins enable row level security;

drop policy if exists "admins manage guests" on public.guests;
create policy "admins manage guests" on public.guests for all to authenticated
  using (exists (select 1 from public.admins a where a.email = (select auth.jwt() ->> 'email')))
  with check (exists (select 1 from public.admins a where a.email = (select auth.jwt() ->> 'email')));

-- Public lookup by exact code only: anon cannot list the table.
create or replace function public.get_guest(p_code text)
returns table (name text, company text, tier text, table_no text)
language sql stable security definer set search_path = ''
as $$ select g.name, g.company, g.tier, g.table_no from public.guests g where g.code = p_code $$;

revoke all on function public.get_guest(text) from public;
grant execute on function public.get_guest(text) to anon, authenticated;

-- Then: create the user in Authentication → Users, and allow it:
-- insert into public.admins (email) values ('you@example.com');
