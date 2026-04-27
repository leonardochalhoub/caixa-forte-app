-- Caixa Forte — endurecimento pós-Conselho v3
-- Conselheiros (supabase, schema, finanças) flagaram 3 itens críticos:
--
--   1) Backfill paid_source: 0050 deixou 543 rows em prod com paid_at
--      setado e paid_source NULL. Trigger autoset_paid_source só cobre
--      INSERT — qualquer UPDATE futuro que toque paid_at sem setar
--      paid_source também fica órfão.
--
--   2) Simetria peer FK: schema-designer flagou desde v2. A.peer=B
--      não implica B.peer=A. void_transfer pode falhar parcial.
--
--   3) propagate_category_archive só cobre filhos diretos (1 nível).
--      Hierarquia 3+ níveis deixa netos órfãos ativos.

-- ============================================================================
-- 1) Backfill paid_source nas 543 rows legadas em prod
-- ============================================================================
-- Mesmo mapa do trigger 0050:autoset_paid_source.
update public.transactions
  set paid_source = case
    when source like 'telegram%' then 'manual'
    when source = 'web' or source = 'web_voice' then 'manual'
    when source in ('csv', 'ofx', 'import') then 'import'
    else 'manual'
  end
  where paid_at is not null
    and paid_source is null;

-- ============================================================================
-- 2) Estende autoset_paid_source pra cobrir UPDATE também
-- ============================================================================
-- Conselheiro Supabase: trigger de 0050 era BEFORE INSERT. Pipelines que
-- setam paid_at num UPDATE (ex.: pay_invoice marcando charges) deixam
-- paid_source NULL. Cobrir UPDATE elimina o vetor.
drop trigger if exists trg_transactions_autoset_paid_source on public.transactions;
create trigger trg_transactions_autoset_paid_source
  before insert or update of paid_at on public.transactions
  for each row
  execute function public.autoset_paid_source();

-- ============================================================================
-- 3) Trigger de simetria peer FK
-- ============================================================================
-- Garante que se A.transfer_peer_id = B então B.transfer_peer_id = A.
-- Cobre escritas ad-hoc (Studio, scripts) que não passam por pay_invoice
-- ou void_transfer.
create or replace function public.enforce_transfer_peer_symmetry()
returns trigger
language plpgsql
as $$
begin
  -- Só age quando peer_id muda. Skip quando peer_id virou NULL (FK
  -- ON DELETE SET NULL ou void_transfer apaga primeiro lado).
  if new.transfer_peer_id is null then
    return new;
  end if;

  if (tg_op = 'UPDATE' and old.transfer_peer_id is not distinct from new.transfer_peer_id) then
    return new;
  end if;

  -- Atualiza o outro lado pra apontar de volta. WHERE peer atual difere
  -- evita loop infinito de trigger.
  update public.transactions
    set transfer_peer_id = new.id
    where id = new.transfer_peer_id
      and (transfer_peer_id is distinct from new.id);

  return new;
end;
$$;

drop trigger if exists trg_transactions_peer_symmetry on public.transactions;
create trigger trg_transactions_peer_symmetry
  after insert or update of transfer_peer_id on public.transactions
  for each row
  execute function public.enforce_transfer_peer_symmetry();

comment on function public.enforce_transfer_peer_symmetry is
  'Mantém invariante A.peer=B ⇔ B.peer=A. Cobre escritas ad-hoc (Studio, scripts) que não passam pelos RPCs.';

-- ============================================================================
-- 4) propagate_category_archive recursivo (cobre netos, bisnetos)
-- ============================================================================
create or replace function public.propagate_category_archive()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.archived_at is null and new.archived_at is not null then
    -- WITH RECURSIVE pra coletar TODA descendência (não só filhos diretos).
    with recursive descendants as (
      select id from public.categories where parent_id = new.id
      union all
      select c.id
        from public.categories c
        join descendants d on c.parent_id = d.id
    )
    update public.categories
      set archived_at = new.archived_at
    where id in (select id from descendants)
      and archived_at is null;
  end if;
  return new;
end;
$$;

comment on function public.propagate_category_archive is
  'Quando categoria é arquivada, propaga aos descendentes (recursivo via CTE). Reativação NÃO é propagada — decisão consciente.';
