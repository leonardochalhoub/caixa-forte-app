-- Track clicks on the "Documentação" button so the sysadmin KPI can show
-- engagement with the public docs page.
create table if not exists public.doc_clicks (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete set null,
  source text not null check (source in ('main', 'profile')),
  clicked_at timestamptz not null default now()
);

create index if not exists doc_clicks_source_idx on public.doc_clicks (source, clicked_at desc);
create index if not exists doc_clicks_time_idx on public.doc_clicks (clicked_at desc);

alter table public.doc_clicks enable row level security;

-- Public INSERT: anonymous users on the landing page should be able to log
-- a click. Row only allows the caller's own user_id (or NULL for anon).
drop policy if exists "doc_clicks_insert_anon" on public.doc_clicks;
create policy "doc_clicks_insert_anon"
  on public.doc_clicks for insert
  with check (user_id is null or user_id = auth.uid());

-- Only admins/owners can read the audit rows.
drop policy if exists "doc_clicks_select_admin" on public.doc_clicks;
create policy "doc_clicks_select_admin"
  on public.doc_clicks for select
  using (exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role in ('admin', 'owner')
  ));

comment on table public.doc_clicks is 'Analytics: every time a user (anon or logged-in) opens the public docs page from main/profile buttons.';
