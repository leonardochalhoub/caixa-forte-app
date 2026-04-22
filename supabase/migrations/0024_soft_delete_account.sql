-- Soft-delete + reactivation support.
--
-- deleted_at: non-null means the account is currently deactivated. Data
--   stays in place; access is blocked until a reactivation event clears
--   the timestamp. Triggered by the user via /app/profile.
-- account_lifecycle_events: append-only audit log of every deletion and
--   reactivation, so /app/profile can show the full history.

alter table public.profiles
  add column if not exists deleted_at timestamptz;

create index if not exists profiles_deleted_at_idx on public.profiles (deleted_at);

create table if not exists public.account_lifecycle_events (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('deleted', 'reactivated')),
  happened_at timestamptz not null default now(),
  note text
);

create index if not exists account_lifecycle_events_user_time_idx
  on public.account_lifecycle_events (user_id, happened_at desc);

alter table public.account_lifecycle_events enable row level security;

drop policy if exists "lifecycle_select_own" on public.account_lifecycle_events;
create policy "lifecycle_select_own"
  on public.account_lifecycle_events for select
  using (auth.uid() = user_id);

drop policy if exists "lifecycle_select_admin" on public.account_lifecycle_events;
create policy "lifecycle_select_admin"
  on public.account_lifecycle_events for select
  using (exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role in ('admin', 'owner')
  ));

-- Writes are owner-only (via admin client in server actions); no policy
-- needed because service role bypasses RLS.

comment on column public.profiles.deleted_at is 'Soft-delete timestamp. Non-null blocks access; cleared on reactivation.';
comment on table public.account_lifecycle_events is 'Audit log: deletion + reactivation events per user.';
