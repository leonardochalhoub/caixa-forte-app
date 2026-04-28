-- Caixa Forte — backfill: tickets existentes viram entrada formal do mês
-- User reportou: "I added Ticket Vale-alimentação and Ticket Vale-refeição,
-- but it didnt count on the saldo or entradas in the month."
--
-- Saldo já estava sendo contado via opening_balance_cents (visível no
-- painel "Vale-benefício"). Mas Entradas do mês não — opening_balance
-- não vira tx, só fica como saldo inicial silencioso.
--
-- Solução: pra contas type='ticket' com opening_balance_cents > 0,
-- criar transaction de income (paid_at=now()) com merchant
-- "Saldo inicial · {nome conta}" e categoria 'Salário' (primeira
-- formal income do user). Em seguida zera opening_balance pra evitar
-- contar dobrado.
--
-- Comportamento futuro: createAccount action faz isso automaticamente
-- quando isFormalIncome=true e openingBalance>0.

-- 1. Cria income tx pra cada conta ticket com opening_balance > 0,
--    pegando a primeira categoria formal income do user.
insert into public.transactions
  (user_id, account_id, category_id, type, amount_cents, occurred_on,
   merchant, note, source, paid_at)
select
  a.user_id,
  a.id,
  -- Primeira categoria formal income do user (Salário/Extra/Renda).
  -- LATERAL JOIN seria mais limpo mas Supabase API limita.
  (
    select c.id from public.categories c
    where c.user_id = a.user_id
      and c.is_formal_income = true
      and c.archived_at is null
    order by c.sort_order asc
    limit 1
  ),
  'income',
  a.opening_balance_cents,
  current_date,
  'Saldo inicial · ' || a.name,
  'Lançamento retroativo (mig 0057): opening_balance virou entrada formal do mês quando type=ticket foi adicionado.',
  'manual',
  now()
from public.accounts a
where a.type = 'ticket'
  and a.opening_balance_cents > 0
  -- Idempotência: pula contas que já têm uma tx "Saldo inicial · ..."
  and not exists (
    select 1 from public.transactions t
    where t.account_id = a.id
      and t.merchant like 'Saldo inicial · %'
      and t.source = 'manual'
  );

-- 2. Zera opening_balance_cents nas contas que tiveram tx criada
--    (evita contagem dobrada: agora o saldo vem da tx, não do opening).
update public.accounts a
  set opening_balance_cents = 0
  where a.type = 'ticket'
    and a.opening_balance_cents > 0
    and exists (
      select 1 from public.transactions t
      where t.account_id = a.id
        and t.merchant like 'Saldo inicial · %'
    );
