-- Caixa Forte — baseline de balance_snapshots
-- Conselho v3 (Supabase): "balance_snapshots vazio em prod (0 rows).
-- Cron Vercel ainda não rodou ou falhou. Sem baseline, gráfico de
-- tendência só vai existir a partir do dia em que o cron passar a rodar."
--
-- Esta migration popula 1 snapshot por user pra HOJE, calculado em SQL
-- puro (sem precisar do cron rodar). Idempotente via ON CONFLICT do
-- UNIQUE (user_id, snapshot_date).

-- Função SQL que retorna jsonb {account_id: cents, ...} pro user.
create or replace function public.compute_per_account_balance(p_user_id uuid)
returns jsonb
language sql
stable
as $$
  with acct as (
    select id, type, opening_balance_cents
    from public.accounts
    where user_id = p_user_id
      and archived_at is null
  ),
  effects as (
    select t.account_id,
      sum(case when t.type = 'income' then t.amount_cents else -t.amount_cents end)::bigint as delta
    from public.transactions t
    where t.user_id = p_user_id
      and t.paid_at is not null
    group by t.account_id
  )
  select coalesce(jsonb_object_agg(
    a.id::text,
    a.opening_balance_cents + coalesce(e.delta, 0)
  ), '{}'::jsonb)
  from acct a
  left join effects e on e.account_id = a.id;
$$;

-- Função SQL que agrega per_account → per_account_type via lookup.
create or replace function public.compute_per_account_type(p_user_id uuid, p_per_account jsonb)
returns jsonb
language sql
stable
as $$
  with kv as (
    select key as acct_id, value::bigint as cents
    from jsonb_each_text(p_per_account)
  ),
  typed as (
    select a.type, sum(k.cents)::bigint as total
    from kv k
    join public.accounts a on a.id::text = k.acct_id
    where a.user_id = p_user_id
    group by a.type
  )
  select coalesce(jsonb_object_agg(type, total), '{}'::jsonb) from typed;
$$;

-- Backfill: 1 row por user pra hoje (timezone São Paulo).
insert into public.balance_snapshots
  (user_id, snapshot_date, total_balance_cents, per_account, per_account_type)
select
  u.user_id,
  (now() at time zone 'America/Sao_Paulo')::date as snapshot_date,
  -- soma todos os values do per_account
  (select coalesce(sum(value::bigint), 0)::bigint
    from jsonb_each_text(public.compute_per_account_balance(u.user_id))) as total,
  public.compute_per_account_balance(u.user_id) as per_account,
  public.compute_per_account_type(
    u.user_id,
    public.compute_per_account_balance(u.user_id)
  ) as per_account_type
from (
  select distinct user_id from public.accounts where archived_at is null
) u
on conflict (user_id, snapshot_date) do update
  set total_balance_cents = excluded.total_balance_cents,
      per_account = excluded.per_account,
      per_account_type = excluded.per_account_type;

comment on function public.compute_per_account_balance is
  'Calcula saldo por conta pro user (opening + soma de tx pagas). Reusada pelo cron e pelo backfill.';
comment on function public.compute_per_account_type is
  'Agrega per_account jsonb → per_account_type via lookup de accounts.type.';
