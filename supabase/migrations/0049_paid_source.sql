-- Caixa Forte — paid_source pra distinguir como paid_at foi setado
-- Conselho (schema-designer) flagged: o backfill de 0025 setou
-- paid_at = occurred_on + 12h em TODAS as charges passadas. Charges
-- históricos sem fatura paga aparecem como "liquidados" em KPIs de
-- saldo, sem como distinguir de pagamentos reais via pay_invoice.
--
-- Estratégia: coluna nullable paid_source com 4 valores:
--   'backfill'    → marcado pelo backfill 0025 (heurística occurred_on+12h)
--   'invoice_rpc' → marcado pelo pay_invoice (charge da fatura paga)
--   'manual'      → o user marcou como paid_at via UI/import
--   'import'      → import futuro (CSV, OFX) com paid_at já preenchido
--
-- Coluna é additive — null = legado / desconhecido (bom default).

alter table public.transactions
  add column if not exists paid_source text
    check (paid_source is null or paid_source in ('backfill', 'invoice_rpc', 'manual', 'import'));

comment on column public.transactions.paid_source is
  'Origem do paid_at quando setado. NULL = desconhecido/legado.';

-- Backfill retroativo: charges com paid_at exatamente = occurred_on + 12h
-- foram marcados pela migration 0025. Marca como 'backfill' pra ficar
-- distinguível dos pagamentos reais. Best-effort — paid_at idêntico
-- por coincidência teórica é raríssimo.
update public.transactions
  set paid_source = 'backfill'
  where paid_at is not null
    and tx_kind = 'charge'
    and paid_source is null
    and paid_at = (occurred_on::timestamptz + interval '12 hours');

-- pay_invoice: agora seta paid_source nas charges marcadas E nas
-- transações criadas. Permite reconstrução cirúrgica.
create or replace function public.pay_invoice(
  p_card_id uuid,
  p_source_account_id uuid,
  p_amount_cents bigint,
  p_invoice_label text,
  p_idempotency_key uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_card_name text;
  v_card_user uuid;
  v_card_type text;
  v_closing_day smallint;
  v_bank_key text;
  v_invoice_year text;
  v_invoice_month_idx int;
  v_invoice_ym text;
  v_now timestamptz := now();
  v_today date := current_date;
  v_merchant text := 'Pagamento fatura ' || p_invoice_label;
  v_deleted_scheduled_ids uuid[];
  v_marked_charge_ids uuid[];
  v_expense_id uuid;
  v_income_id uuid;
  v_existing_expense_id uuid;
  v_existing_income_id uuid;
  v_label_norm text;
  v_month_names text[] := array[
    'janeiro','fevereiro','marco','abril','maio','junho',
    'julho','agosto','setembro','outubro','novembro','dezembro'
  ];
  v_i int;
begin
  if v_user_id is null then
    raise exception 'auth.uid() é null — chamada precisa de sessão autenticada';
  end if;

  if p_idempotency_key is not null then
    select id, transfer_peer_id
      into v_existing_expense_id, v_existing_income_id
    from public.transactions
    where user_id = v_user_id
      and idempotency_key = p_idempotency_key
      and tx_kind = 'invoice_payment'
      and is_transfer = false
    limit 1;

    if v_existing_expense_id is not null then
      return jsonb_build_object(
        'expense_id', v_existing_expense_id,
        'income_id', v_existing_income_id,
        'idempotent_replay', true,
        'deleted_scheduled_ids', '{}'::uuid[],
        'marked_charge_ids', '{}'::uuid[]
      );
    end if;
  end if;

  select name, type, closing_day, user_id
    into v_card_name, v_card_type, v_closing_day, v_card_user
  from public.accounts
  where id = p_card_id;

  if v_card_user is null then raise exception 'Cartão não encontrado'; end if;
  if v_card_user <> v_user_id then raise exception 'Cartão não pertence ao usuário'; end if;
  if v_card_type <> 'credit' then raise exception 'Conta alvo não é cartão de crédito'; end if;

  perform 1 from public.accounts
    where id = p_source_account_id and user_id = v_user_id;
  if not found then raise exception 'Conta de origem não encontrada'; end if;

  v_bank_key := lower(unaccent(split_part(regexp_replace(v_card_name, 'cart[ãa]o.*', '', 'gi'), ' ', 1)));

  v_label_norm := lower(unaccent(p_invoice_label));
  v_invoice_year := (regexp_match(v_label_norm, '(20\d{2})'))[1];
  v_invoice_month_idx := null;
  for v_i in 1..12 loop
    if position(v_month_names[v_i] in v_label_norm) > 0 then
      v_invoice_month_idx := v_i;
      exit;
    end if;
  end loop;

  if v_invoice_year is not null and v_invoice_month_idx is not null then
    v_invoice_ym := v_invoice_year || '-' || lpad(v_invoice_month_idx::text, 2, '0');

    with del as (
      delete from public.transactions t
      where t.user_id = v_user_id
        and t.paid_at is null
        and t.is_transfer = false
        and t.type = 'expense'
        and t.account_id <> p_card_id
        and lower(unaccent(coalesce(t.merchant, ''))) like '%cartao%'
        and lower(unaccent(coalesce(t.merchant, ''))) like '%' || v_bank_key || '%'
        and lower(unaccent(coalesce(t.merchant, ''))) like '%' || v_month_names[v_invoice_month_idx] || '%'
        and lower(unaccent(coalesce(t.merchant, ''))) like '%' || v_invoice_year || '%'
      returning id
    )
    select array_agg(id) into v_deleted_scheduled_ids from del;

    -- Marca charges como pagas + paid_source='invoice_rpc'
    with upd as (
      update public.transactions t
      set paid_at = v_now,
          paid_source = 'invoice_rpc'
      where t.user_id = v_user_id
        and t.account_id = p_card_id
        and t.type = 'expense'
        and t.is_transfer = false
        and t.paid_at is null
        and (
          (v_closing_day is null and to_char(t.occurred_on, 'YYYY-MM') = v_invoice_ym)
          or (
            v_closing_day is not null
            and (
              (extract(day from t.occurred_on)::int <= v_closing_day
                and to_char(t.occurred_on, 'YYYY-MM') = v_invoice_ym)
              or (extract(day from t.occurred_on)::int > v_closing_day
                and to_char(t.occurred_on + interval '1 month', 'YYYY-MM') = v_invoice_ym)
            )
          )
        )
      returning id
    )
    select array_agg(id) into v_marked_charge_ids from upd;
  end if;

  insert into public.transactions
    (user_id, account_id, type, amount_cents, occurred_on, merchant, note,
     source, is_transfer, paid_at, tx_kind, idempotency_key, paid_source)
  values
    (v_user_id, p_source_account_id, 'expense', p_amount_cents, v_today,
     v_merchant, 'Pagamento da fatura ' || p_invoice_label,
     'manual', false, v_now, 'invoice_payment', p_idempotency_key, 'invoice_rpc')
  returning id into v_expense_id;

  insert into public.transactions
    (user_id, account_id, type, amount_cents, occurred_on, merchant, note,
     source, is_transfer, paid_at, tx_kind, transfer_peer_id, idempotency_key, paid_source)
  values
    (v_user_id, p_card_id, 'income', p_amount_cents, v_today,
     v_merchant, 'Entrada crédito — fatura ' || p_invoice_label || ' paga',
     'manual', true, v_now, 'invoice_payment', v_expense_id, p_idempotency_key, 'invoice_rpc')
  returning id into v_income_id;

  update public.transactions
    set transfer_peer_id = v_income_id
    where id = v_expense_id;

  return jsonb_build_object(
    'expense_id', v_expense_id,
    'income_id', v_income_id,
    'idempotent_replay', false,
    'deleted_scheduled_ids', coalesce(v_deleted_scheduled_ids, '{}'::uuid[]),
    'marked_charge_ids', coalesce(v_marked_charge_ids, '{}'::uuid[])
  );
end;
$$;

comment on function public.pay_invoice is
  'Pagamento atômico de fatura. Idempotente via p_idempotency_key. Marca charges + cria par expense+income com paid_source=invoice_rpc.';
