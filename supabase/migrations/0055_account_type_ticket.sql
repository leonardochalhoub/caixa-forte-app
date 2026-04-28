-- Caixa Forte — adiciona 'ticket' ao CHECK constraint de accounts.type
-- User reportou: criou "Ticket Vale-alimentação" e "Ticket Vale-refeição"
-- mas só conseguiu como type='checking' (default). Vale-benefício é
-- categoria distinta — não é conta bancária nem investimento.
--
-- Tratamento: novo tipo 'ticket' que entra no saldo total como líquido
-- (você usa o dinheiro pra pagar comida hoje, igual conta corrente).
-- A diferenciação é visual + semântica.

-- Drop CHECK existente. Tenta os possíveis nomes que migrations
-- anteriores podem ter usado (depende de qual migration foi aplicada).
do $$
declare
  cn text;
begin
  for cn in
    select conname from pg_constraint c
      join pg_class cl on cl.oid = c.conrelid
    where cl.relname = 'accounts'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%checking%credit%'
  loop
    execute 'alter table public.accounts drop constraint ' || quote_ident(cn);
  end loop;
end $$;

-- Re-cria com 'ticket' incluído. Mantém todos os tipos pré-existentes.
alter table public.accounts
  add constraint accounts_type_check
    check (type in (
      'checking',
      'credit',
      'cash',
      'wallet',
      'savings',
      'investment',
      'crypto',
      'fgts',
      'ticket'
    ));

-- Migra contas Ticket Vale-* existentes do user que reportou (e
-- qualquer outra conta com nome começando "Ticket Vale-") de checking
-- pra ticket. Idempotente — re-rodar não muda nada.
update public.accounts
  set type = 'ticket'
  where type = 'checking'
    and name ilike 'Ticket Vale-%';

comment on constraint accounts_type_check on public.accounts is
  'Tipos de conta: checking (corrente), credit (cartão), cash, wallet, savings (poupança), investment, crypto, fgts, ticket (vale-benefício corporativo).';
