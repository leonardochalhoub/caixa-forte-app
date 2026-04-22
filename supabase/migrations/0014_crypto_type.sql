-- Caixa Forte — add crypto account type (Bitcoin, Ethereum, etc).
-- Treated as renda variável in KPI breakdowns.

alter table public.accounts
  drop constraint if exists accounts_type_check;

alter table public.accounts
  add constraint accounts_type_check
  check (type in (
    'checking', 'credit', 'cash', 'wallet', 'savings', 'investment', 'poupanca', 'crypto'
  ));

comment on column public.accounts.type is
  'checking | credit | cash | wallet | savings | investment | poupanca | crypto. crypto = renda variável.';
