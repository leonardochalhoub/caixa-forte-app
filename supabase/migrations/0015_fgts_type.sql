-- Caixa Forte — add fgts account type (Brazilian mandatory employment fund).
-- Valor que fica no FGTS não é líquido e segue regras próprias; painel separado.

alter table public.accounts
  drop constraint if exists accounts_type_check;

alter table public.accounts
  add constraint accounts_type_check
  check (type in (
    'checking', 'credit', 'cash', 'wallet',
    'savings', 'investment', 'poupanca', 'crypto', 'fgts'
  ));

comment on column public.accounts.type is
  'checking | credit | cash | wallet | savings | investment | poupanca | crypto | fgts. fgts = fundo de garantia.';
