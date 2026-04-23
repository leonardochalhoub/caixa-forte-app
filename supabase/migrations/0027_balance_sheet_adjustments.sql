-- Ajustes manuais do Balanço Contábil.
-- O valor base vem do cálculo automático das contas; este row guarda
-- um override por linha/período quando o user quer ajustar na mão.

create table if not exists public.balance_adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- "mensal:2026-04" ou "anual:2026"
  period text not null,
  -- chave da linha: ex "ativo_circulante:conta_corrente" ou
  -- "passivo_circulante:cartoes" ou uma linha custom "ativo_nc:imobilizado:imovel_a"
  line_key text not null,
  label text not null,
  amount_cents bigint not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now(),
  unique (user_id, period, line_key)
);

create index if not exists balance_adjustments_user_period_idx
  on public.balance_adjustments (user_id, period);

alter table public.balance_adjustments enable row level security;

create policy "balance_adjustments_own"
  on public.balance_adjustments
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

comment on table public.balance_adjustments is
  'Overrides/ajustes do Balanço Contábil por período (mês ou ano). Permite o usuário adicionar linhas fora do que o sistema calcula automaticamente das contas.';
