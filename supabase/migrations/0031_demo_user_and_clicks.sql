-- Conta de demonstração pública (Larissa) + tracking de cliques no link
-- da landing page. is_demo marca o perfil pra ser excluído das métricas
-- de usuários reais no sysadmin.

alter table public.profiles
  add column if not exists is_demo boolean not null default false;

create index if not exists profiles_is_demo_idx
  on public.profiles (is_demo)
  where is_demo = true;

comment on column public.profiles.is_demo is
  'Marca contas seed/demo públicas. Excluídas de métricas reais de usuários.';

-- Cada clique no link "Ver conta de exemplo" gera uma linha aqui.
-- Sem user_id, sem PII — só agregados pra sysadmin KPI.
create table if not exists public.demo_clicks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_agent text,
  referrer text,
  ip_hash text
);

create index if not exists demo_clicks_created_at_idx
  on public.demo_clicks (created_at desc);

alter table public.demo_clicks enable row level security;

-- Só admins/owners leem. Ninguém escreve diretamente — o endpoint
-- /api/demo-access usa service role pra inserir.
create policy "demo_clicks_admin_read"
  on public.demo_clicks
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.role in ('admin', 'owner')
    )
  );

comment on table public.demo_clicks is
  'Log agregado de cliques no link de conta de demonstração da landing.';
