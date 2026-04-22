-- Caixa Forte — add savings account type for renda fixa / investimentos.

alter table public.accounts
  drop constraint if exists accounts_type_check;

alter table public.accounts
  add constraint accounts_type_check
  check (type in ('checking', 'credit', 'cash', 'wallet', 'savings'));

comment on column public.accounts.type is
  'checking | credit | cash | wallet | savings. savings = renda fixa / investimento.';
