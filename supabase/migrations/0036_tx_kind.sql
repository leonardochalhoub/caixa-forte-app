-- Caixa Forte — tx_kind: classificação semântica explícita
-- Hoje a app infere "isso é charge / invoice payment / refund" via
-- (account.type, type, is_transfer, merchant LIKE '...'). Frágil.
-- tx_kind torna explícito e queryável.
--
-- Valores:
--   'charge'          → compra no cartão (account.type=credit,
--                        type=expense, is_transfer=false)
--   'invoice_payment' → pagamento de fatura: par income (no cartão,
--                        is_transfer=true) + expense (na corrente,
--                        is_transfer=false). Ambos lados marcam
--                        invoice_payment.
--   'refund'          → estorno no cartão
--   'fee'             → tarifa / IOF / juros
--   'transfer'        → transferência interna entre contas
--   NULL              → tx regular (renda, despesa do dia-a-dia)

alter table public.transactions
  add column if not exists tx_kind text
    check (tx_kind is null or tx_kind in (
      'charge', 'invoice_payment', 'refund', 'fee', 'transfer'
    ));

create index if not exists transactions_tx_kind_idx
  on public.transactions (user_id, tx_kind)
  where tx_kind is not null;

comment on column public.transactions.tx_kind is
  'Classificação semântica da tx: charge | invoice_payment | refund | fee | transfer | NULL (regular). Permite GROUP BY explícito sem inferir via merchant string.';

-- Backfill: deduz a partir de (account.type, type, is_transfer, merchant)
update public.transactions t
set tx_kind = case
  -- Pagamentos de fatura (par criado por public.pay_invoice / botão Pagar)
  when lower(unaccent(coalesce(t.merchant, ''))) like 'pagamento fatura%'
    then 'invoice_payment'

  -- Refunds explícitos
  when lower(unaccent(coalesce(t.merchant, ''))) like 'refund%'
    or lower(unaccent(coalesce(t.merchant, ''))) like 'estorno%'
    then 'refund'

  -- Charges em cartão de crédito
  when t.is_transfer = false
    and t.type = 'expense'
    and exists (
      select 1 from public.accounts a
      where a.id = t.account_id and a.type = 'credit'
    )
    then 'charge'

  -- Demais transferências
  when t.is_transfer = true
    then 'transfer'

  -- Regular: deixa null
  else null
end
where t.tx_kind is null;
