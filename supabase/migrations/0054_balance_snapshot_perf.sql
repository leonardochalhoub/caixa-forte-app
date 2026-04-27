-- Caixa Forte — otimização do backfill de balance_snapshots
-- Conselheiro Schema v4: "compute_per_account_balance é chamada DUAS
-- VEZES no INSERT do 0053 (linhas 66 e 70). Em prod com muitas contas
-- escala mal — scan duplo desnecessário."
--
-- Solução: CTE no INSERT calcula per_account uma vez e reutiliza.
-- Idempotente via ON CONFLICT como antes.
--
-- Esta migration é additive — não altera schema, só re-roda backfill
-- com query melhor pra qualquer user que passou a ter conta após 0053
-- (futuros baselines via cron já são 1 chamada da function por user
-- via /api/cron/balance-snapshot, então cron já estava OK).

with src as (
  select
    u.user_id,
    public.compute_per_account_balance(u.user_id) as per_account
  from (select distinct user_id from public.accounts where archived_at is null) u
)
insert into public.balance_snapshots
  (user_id, snapshot_date, total_balance_cents, per_account, per_account_type)
select
  s.user_id,
  (now() at time zone 'America/Sao_Paulo')::date,
  (select coalesce(sum(value::bigint), 0)::bigint
    from jsonb_each_text(s.per_account)) as total,
  s.per_account,
  public.compute_per_account_type(s.user_id, s.per_account)
from src s
on conflict (user_id, snapshot_date) do update
  set total_balance_cents = excluded.total_balance_cents,
      per_account = excluded.per_account,
      per_account_type = excluded.per_account_type;
