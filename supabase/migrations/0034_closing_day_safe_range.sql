-- Caixa Forte — closing_day limitado a 1..28
-- Antes: CHECK (closing_day between 1 and 31). Problema: meses curtos
-- (fev/abr/jun/set/nov) não têm dia 29/30/31 — chargeInvoiceMonth
-- comparava day <= closing_day, e em mês curto isso silencia (todas
-- as compras viravam "post-closing" pra fatura seguinte).
-- 28 é o maior valor seguro pra todos os meses do ano.

-- Drop a constraint antiga (gerada pelo nome "accounts_closing_day_check")
alter table public.accounts
  drop constraint if exists accounts_closing_day_check;

-- Backfill: cap valores > 28 em 28 antes de adicionar nova CHECK
update public.accounts
  set closing_day = 28
  where closing_day is not null and closing_day > 28;

-- Reaplicar com janela segura
alter table public.accounts
  add constraint accounts_closing_day_check
  check (closing_day is null or (closing_day between 1 and 28));

comment on column public.accounts.closing_day is
  'Dia do mês em que a fatura fecha (1..28). Só pra type=credit. NULL = usa mês-calendário (sem closing_day).';
