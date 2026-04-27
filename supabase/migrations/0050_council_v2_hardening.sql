-- Caixa Forte — endurecimento pós-Conselho v2
-- Conselheiros (mirante:eng-software, mirante:financas, supabase-specialist,
-- schema-designer, genai-architect) flagaram polish remanescente.
--
-- Pacote único:
--   1) Replica identity full em capture_messages, messages, alert_events
--      (sem isso, eventos UPDATE/DELETE só carregam PK no realtime).
--   2) Hardening de execute em pay_invoice (revoke public, grant authenticated).
--   3) Index parcial (account_id, occurred_on DESC) WHERE paid_at IS NULL
--      pra acelerar queries de fatura.
--   4) Trigger que propaga archived_at de categoria pai pros filhos.
--   5) Backfill: tx_kind NULL → 'charge' em despesas legadas de cartão.
--   6) Trigger que autoseta paid_source quando paid_at é setado num INSERT
--      (defensa contra NULL silencioso de pipelines).

-- ============================================================================
-- 1) Replica identity full nas tabelas user-scoped que entraram no realtime
-- ============================================================================
alter table public.capture_messages replica identity full;
alter table public.messages replica identity full;
alter table public.alert_events replica identity full;

-- ============================================================================
-- 2) Hardening de execute em pay_invoice
-- ============================================================================
revoke execute on function public.pay_invoice(uuid, uuid, bigint, text, uuid)
  from public;
grant execute on function public.pay_invoice(uuid, uuid, bigint, text, uuid)
  to authenticated;

-- ============================================================================
-- 3) Index parcial pra acelerar lookup de charges não-pagas por conta
-- ============================================================================
create index if not exists transactions_account_occurred_unpaid_idx
  on public.transactions (account_id, occurred_on desc)
  where paid_at is null;

comment on index public.transactions_account_occurred_unpaid_idx is
  'Acelera o UPDATE de pay_invoice (charges não-pagas por cartão num bucket de mês). Partial em paid_at IS NULL reduz drasticamente o tamanho do index.';

-- ============================================================================
-- 4) Propagação de archived_at em categorias hierárquicas
-- ============================================================================
create or replace function public.propagate_category_archive()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Só propaga quando archived_at vai de NULL → NOT NULL.
  -- Reativação (NOT NULL → NULL) NÃO é propagada — user pode querer
  -- reativar só o pai e deixar filhos arquivados (decisão consciente).
  if old.archived_at is null and new.archived_at is not null then
    update public.categories
      set archived_at = new.archived_at
    where parent_id = new.id
      and archived_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_categories_archive_propagate on public.categories;
create trigger trg_categories_archive_propagate
  after update of archived_at on public.categories
  for each row
  execute function public.propagate_category_archive();

comment on function public.propagate_category_archive is
  'Quando uma categoria pai é arquivada, propaga o archived_at pros filhos diretos. Evita filhos órfãos ativos sob pai arquivado.';

-- ============================================================================
-- 5) Backfill: tx_kind NULL → 'charge' em despesas de cartão de crédito
-- ============================================================================
-- Schema-designer flagou: 0036 fez backfill mas pode ter deixado rows escapar.
-- Backfill aditivo, idempotente.
update public.transactions t
  set tx_kind = 'charge'
  from public.accounts a
  where t.account_id = a.id
    and a.type = 'credit'
    and t.type = 'expense'
    and t.is_transfer = false
    and t.tx_kind is null;

-- ============================================================================
-- 6) Autoset de paid_source quando paid_at é preenchido num INSERT
-- ============================================================================
-- Sem isso, pipelines (capture, import) podem deixar paid_source NULL
-- mesmo com paid_at setado, refazendo a ambiguidade que 0049 resolveu.
create or replace function public.autoset_paid_source()
returns trigger
language plpgsql
as $$
begin
  -- Se paid_at foi preenchido mas paid_source não, deduz a origem do source.
  if new.paid_at is not null and new.paid_source is null then
    new.paid_source := case
      when new.source like 'telegram%' then 'manual'
      when new.source = 'web' or new.source = 'web_voice' then 'manual'
      when new.source in ('csv', 'ofx', 'import') then 'import'
      else 'manual'
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_transactions_autoset_paid_source on public.transactions;
create trigger trg_transactions_autoset_paid_source
  before insert on public.transactions
  for each row
  execute function public.autoset_paid_source();

comment on function public.autoset_paid_source is
  'Defesa em profundidade: garante que paid_source seja preenchido quando paid_at também é, mesmo se o caller esquecer. Mapa source → paid_source.';
