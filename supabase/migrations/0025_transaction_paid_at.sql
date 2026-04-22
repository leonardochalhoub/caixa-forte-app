-- When was this transaction actually debited/credited? NULL means "due but
-- not yet settled" — used for scheduled expenses whose `occurred_on` is in
-- the future. Balance/flow calculations count only rows where paid_at IS
-- NOT NULL. Any existing row with `occurred_on <= today` is back-filled so
-- nothing silently falls off the saldo.

alter table public.transactions
  add column if not exists paid_at timestamptz;

create index if not exists transactions_paid_at_idx
  on public.transactions (paid_at)
  where paid_at is not null;

-- Backfill: every historical row whose occurred_on is in the past gets a
-- paid_at equal to its occurred_on (noon to avoid timezone edge cases).
-- Future-dated rows stay NULL until the user marks them as paid.
update public.transactions
  set paid_at = (occurred_on::timestamptz + interval '12 hours')
  where paid_at is null
    and occurred_on <= current_date;

comment on column public.transactions.paid_at is
  'When the money actually moved. NULL = scheduled/unpaid. Balance counts only rows with paid_at set.';
