-- Dia de fechamento da fatura do cartão de crédito.
-- Charges feitos ATÉ closing_day caem na fatura do mês corrente;
-- charges DEPOIS caem na fatura do mês seguinte. Só aplicável a
-- accounts.type = 'credit'. NULL = trata por mês-calendário (fallback).

alter table public.accounts
  add column if not exists closing_day smallint
    check (closing_day is null or (closing_day between 1 and 31));

comment on column public.accounts.closing_day is
  'Dia do mês em que a fatura fecha. Só para type=credit. NULL = usa mês-calendário.';

-- Backfill: todo cartão existente começa com closing_day=20 (valor
-- comum no Brasil). O user pode ajustar pela UI depois.
update public.accounts
  set closing_day = 20
  where type = 'credit' and closing_day is null;
