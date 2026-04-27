-- Caixa Forte — relink dos transfers órfãos com critério mais frouxo
-- A migration 0038 fez backfill com janela de 60s. Restaram ~98 pares
-- antigos cujos created_at divergem por mais que isso (manuais ou
-- importados). Agora tenta linkar com critério mais frouxo:
-- mesmo (user, merchant, amount, occurred_on) sem janela de tempo.
-- Pra evitar falso-positivo entre transfers genuinamente distintos do
-- mesmo user/dia/valor/merchant, exigimos que cada lado tenha apenas
-- UM candidato (uniqueness) — se ambíguo, deixa órfão.

with candidates as (
  select
    a.id as a_id,
    b.id as b_id
  from public.transactions a
  join public.transactions b on
        a.is_transfer = true
    and b.is_transfer = true
    and a.id <> b.id
    and a.user_id = b.user_id
    and coalesce(a.merchant, '') = coalesce(b.merchant, '')
    and a.amount_cents = b.amount_cents
    and a.occurred_on = b.occurred_on
    and a.type = 'expense'
    and b.type = 'income'
  where a.transfer_peer_id is null
    and b.transfer_peer_id is null
),
unique_pairs as (
  -- Filtra pares ambíguos: cada a_id deve ter exatamente 1 b_id e vice-versa
  select a_id, b_id
  from candidates
  where a_id in (select a_id from candidates group by a_id having count(*) = 1)
    and b_id in (select b_id from candidates group by b_id having count(*) = 1)
)
update public.transactions t
set transfer_peer_id = case
  when t.id = p.a_id then p.b_id
  when t.id = p.b_id then p.a_id
end
from unique_pairs p
where t.id in (p.a_id, p.b_id)
  and t.transfer_peer_id is null;
