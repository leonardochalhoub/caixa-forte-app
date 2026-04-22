-- Caixa Forte — flag is_transfer em transactions.
-- Transferências entre contas (Caixa → renda fixa, p.ex.) não contam
-- em "Entrada do mês" nem em "Saída do mês" — só afetam saldo por conta.

alter table public.transactions
  add column if not exists is_transfer boolean not null default false;

comment on column public.transactions.is_transfer is
  'Quando true, representa transferência interna entre contas; fica fora das KPIs de fluxo mensal.';
