-- Caixa Forte — link entre os dois lados de uma transferência
-- Antes: par transfer (expense source + income card, ou expense A +
-- income B em transferências regulares) ficava sem ligação. Voiding
-- ou reconciliação manual era fragmentada.
--
-- Agora: transfer_peer_id self-FK liga A ↔ B. Permite voiding atômico,
-- detecção de transfer órfão, e queries do tipo "todos os movimentos
-- desta transferência".

alter table public.transactions
  add column if not exists transfer_peer_id uuid
    references public.transactions(id) on delete set null;

create index if not exists transactions_transfer_peer_idx
  on public.transactions (transfer_peer_id)
  where transfer_peer_id is not null;

comment on column public.transactions.transfer_peer_id is
  'FK pro outro lado do par transfer. Bi-direcional: A.peer = B AND B.peer = A. NULL = não é transfer ou perdeu o par (órfão).';

-- Backfill: para cada par (expense, income) com mesmo user, mesmo
-- merchant, mesmo amount, mesma data, criados em janela de 60s,
-- linkar bidirecionalmente.
with pairs as (
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
    and a.type = 'expense' and b.type = 'income'
    and abs(extract(epoch from (a.created_at - b.created_at))) < 60
)
update public.transactions t
set transfer_peer_id = case
  when t.id = p.a_id then p.b_id
  when t.id = p.b_id then p.a_id
end
from pairs p
where t.id in (p.a_id, p.b_id)
  and t.transfer_peer_id is null;
