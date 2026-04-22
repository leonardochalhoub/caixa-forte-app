-- Append-only login audit trail. Every successful session creation writes
-- one row (user_id, happened_at, ip, ua). Users can read their own events;
-- admins (profiles.role = 'admin') can read all.

create table if not exists public.login_events (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  happened_at timestamptz not null default now(),
  ip text,
  user_agent text
);

create index if not exists login_events_user_time_idx
  on public.login_events (user_id, happened_at desc);

create index if not exists login_events_time_idx
  on public.login_events (happened_at desc);

alter table public.login_events enable row level security;

drop policy if exists "login_events_insert_own" on public.login_events;
create policy "login_events_insert_own"
  on public.login_events for insert
  with check (auth.uid() = user_id);

drop policy if exists "login_events_select_own" on public.login_events;
create policy "login_events_select_own"
  on public.login_events for select
  using (auth.uid() = user_id);

drop policy if exists "login_events_select_admin" on public.login_events;
create policy "login_events_select_admin"
  on public.login_events for select
  using (exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role = 'admin'
  ));
