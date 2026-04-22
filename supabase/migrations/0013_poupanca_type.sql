-- Caixa Forte — add poupanca account type (Brazilian savings account).
-- Classified as renda fixa para fins de KPI.

alter table public.accounts
  drop constraint if exists accounts_type_check;

alter table public.accounts
  add constraint accounts_type_check
  check (type in (
    'checking', 'credit', 'cash', 'wallet', 'savings', 'investment', 'poupanca'
  ));

comment on column public.accounts.type is
  'checking | credit | cash | wallet | savings | investment | poupanca. poupanca = poupança brasileira, tratada como renda fixa nas KPIs.';
