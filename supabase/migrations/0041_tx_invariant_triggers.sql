-- Caixa Forte — invariantes de transações enforceados via trigger
-- Defesa em profundidade: app já tem 90s dedup + paid_at=null em credit
-- enforced no pipeline, mas trigger no DB cobre QUALQUER caller (script
-- ad-hoc, Studio, futuro endpoint).

-- 1) Dedup 5min: bloqueia INSERT de tx duplicada exata
--    (mesmo user, conta, type, valor, data) criada em <5min.
create or replace function public.prevent_near_duplicate_tx()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1 from public.transactions
    where user_id = new.user_id
      and account_id = new.account_id
      and type = new.type
      and amount_cents = new.amount_cents
      and occurred_on = new.occurred_on
      and created_at >= now() - interval '5 minutes'
      and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) then
    raise exception 'duplicate_transaction_within_5min'
      using errcode = 'unique_violation',
            hint = 'Tx idêntica (user/conta/tipo/valor/data) inserida nos últimos 5min — provável duplicata.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_dup_tx on public.transactions;
create trigger trg_prevent_dup_tx
  before insert on public.transactions
  for each row execute function public.prevent_near_duplicate_tx();

-- 2) paid_at em conta de crédito: charges nascem unpaid sempre.
--    invoice_payment / refund / fee podem ter paid_at não-null
--    (são liquidações). tx_kind='charge' obrigatoriamente paid_at=null.
create or replace function public.enforce_credit_charge_unpaid()
returns trigger
language plpgsql
as $$
declare
  v_acc_type text;
begin
  if new.tx_kind = 'charge' and new.paid_at is not null then
    -- Charges em cartão sempre nascem unpaid; só viram paid quando
    -- a fatura é paga (via pay_invoice RPC ou UPDATE direto).
    -- Bloqueia INSERT — UPDATE depois pode setar paid_at.
    if tg_op = 'INSERT' then
      raise exception 'credit_charge_must_start_unpaid'
        using errcode = 'check_violation',
              hint = 'tx_kind=charge precisa nascer com paid_at=null. Use pay_invoice pra liquidar a fatura inteira.';
    end if;
  end if;

  -- Backstop: se tx_kind=null mas account é credit + type=expense + is_transfer=false,
  -- comporta-se como charge (compat com escritas legacy). paid_at=null obrigatório.
  if new.tx_kind is null
     and new.type = 'expense'
     and new.is_transfer = false
     and tg_op = 'INSERT'
  then
    select type into v_acc_type from public.accounts where id = new.account_id;
    if v_acc_type = 'credit' and new.paid_at is not null then
      raise exception 'credit_charge_must_start_unpaid'
        using errcode = 'check_violation',
              hint = 'Charge implícito (sem tx_kind) em cartão precisa nascer paid_at=null.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_credit_charge_unpaid on public.transactions;
create trigger trg_credit_charge_unpaid
  before insert or update on public.transactions
  for each row execute function public.enforce_credit_charge_unpaid();

comment on function public.prevent_near_duplicate_tx is
  'Bloqueia INSERT de tx duplicada (user/conta/tipo/valor/data) em janela 5min.';
comment on function public.enforce_credit_charge_unpaid is
  'tx_kind=charge (ou expense não-transfer em conta credit) precisa nascer paid_at=null.';
