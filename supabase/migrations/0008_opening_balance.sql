-- Caixa Forte — saldo inicial por conta.
-- opening_balance_cents entra na soma de saldo da conta; NÃO conta como
-- income do mês (não aparece nos KPIs de fluxo mensal).

alter table public.accounts
  add column if not exists opening_balance_cents bigint not null default 0;

comment on column public.accounts.opening_balance_cents is
  'Saldo inicial no momento de vincular a conta ao Caixa Forte. Entra no cálculo de saldo atual, fora do fluxo mensal.';
