-- Caixa Forte — Snapshots diários do patrimônio
-- Conselho v2 (the-planner): "Sem snapshot, gráfico de tendência mente
-- (recalcula sobre estado atual). Snapshots > Recorrências em prioridade
-- — é infra de produto, não conveniência."
--
-- Tabela balance_snapshots guarda foto diária do saldo total + breakdown
-- por conta. Cron diário insere row nova; UI consome pra render trends
-- históricos honestos (vs reconstrução por replay de transações que
-- não captura efeitos de delete/edit em rows passadas).

create table if not exists public.balance_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  snapshot_date date not null,
  total_balance_cents bigint not null,
  -- breakdown por conta como jsonb: {account_id: cents, ...}
  per_account jsonb not null default '{}'::jsonb,
  -- breakdown por categoria de conta: {checking: c, credit: c, savings: c, ...}
  per_account_type jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, snapshot_date)
);

comment on table public.balance_snapshots is
  'Foto diária do patrimônio total + breakdown. Populado por cron diário (/api/cron/balance-snapshot). UI consome pra trends honestos.';

create index if not exists balance_snapshots_user_date_idx
  on public.balance_snapshots (user_id, snapshot_date desc);

-- RLS — user só lê os próprios; cron escreve via service role.
alter table public.balance_snapshots enable row level security;

create policy "balance_snapshots_select_own" on public.balance_snapshots
  for select using (user_id = auth.uid());

-- INSERT/UPDATE/DELETE só via service role (cron). Sem policy = bloqueado
-- pra anon/authenticated. Comportamento consciente, mesmo padrão de
-- alert_events.
