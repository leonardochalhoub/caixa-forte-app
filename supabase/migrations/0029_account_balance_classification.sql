-- Classificação manual por conta no Balanço Contábil.
-- null = usa default por tipo (checking/cash/wallet = circulante;
-- savings/poupanca/investment/crypto = circulante; fgts = nc).
-- 'circulante' | 'nao_circulante' = override explícito do user.

alter table public.accounts
  add column if not exists balance_classification text
    check (balance_classification is null
      or balance_classification in ('circulante', 'nao_circulante'));

comment on column public.accounts.balance_classification is
  'Override da classificação no Balanço Contábil. NULL = default por type.';
