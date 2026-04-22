-- Caixa Forte — add investment account type for renda variável (ações, ETFs, cripto).

alter table public.accounts
  drop constraint if exists accounts_type_check;

alter table public.accounts
  add constraint accounts_type_check
  check (type in ('checking', 'credit', 'cash', 'wallet', 'savings', 'investment'));

comment on column public.accounts.type is
  'checking | credit | cash | wallet | savings | investment. savings = renda fixa, investment = renda variável.';
