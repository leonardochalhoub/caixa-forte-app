-- Caixa Forte — flag de "rendimento formal" em accounts
-- User: "When a user creates a Conta, it must add to saldo. there can
-- be a check box to set if it's a formal earning or not -> formal is
-- salário, vale-alimentação, vale-refeição, premiação, restituição de IR"
--
-- Adiciona coluna is_formal_income (boolean default false). Marca contas
-- cujo saldo veio de rendimento formal (CLT, vale-benefício, premiação,
-- restituição IR). Útil pra relatórios "% do patrimônio em rendimento
-- formal" e pra DRE separar receita formal vs informal.
--
-- Diferente de categories.is_formal_income (que marca a CATEGORIA da
-- transação): este flag está na CONTA — origem do dinheiro que mora ali.

alter table public.accounts
  add column if not exists is_formal_income boolean not null default false;

comment on column public.accounts.is_formal_income is
  'Conta cujo saldo veio de rendimento formal: CLT, vale-benefício, premiação, restituição IR. Default false. Usado em relatórios pra separar formal vs informal.';

-- Backfill heurística: contas type='ticket' são por natureza vale-benefício
-- (formal). Idempotente — só seta quando ainda é false.
update public.accounts
  set is_formal_income = true
  where type = 'ticket'
    and is_formal_income = false;
