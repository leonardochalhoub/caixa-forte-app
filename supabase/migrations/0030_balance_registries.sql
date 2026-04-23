-- Log histórico do Balanço: cada "registro" é uma operação contábil
-- com partida dobrada (débito + crédito de mesmo valor). Os 2 lados
-- geram 2 balance_adjustments linkados por registry_id no metadata.

create table if not exists public.balance_registries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period text not null,
  kind text not null, -- compra_vista | compra_financiada | aporte | retirada | valorizacao | pagamento_divida | emprestimo | reclassificacao
  description text not null,
  amount_cents bigint not null check (amount_cents > 0),
  debit_section text not null,  -- onde o valor ENTRA (ex "ativo_circulante_disponivel")
  debit_label text not null,
  credit_section text not null, -- onde o valor SAI (ex "passivo_nc_financiamentos")
  credit_label text not null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists balance_registries_user_created_idx
  on public.balance_registries (user_id, created_at desc);

create index if not exists balance_registries_user_period_idx
  on public.balance_registries (user_id, period);

alter table public.balance_registries enable row level security;

create policy "balance_registries_own"
  on public.balance_registries
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

comment on table public.balance_registries is
  'Log de registros contábeis (partida dobrada) que editam o Balanço. Cada registro cria 2 balance_adjustments linkados por registry_id no metadata.';
