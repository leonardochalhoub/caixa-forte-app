-- Constraint que enforça invariant já existente por convenção:
-- transfer_peer_id só pode estar setado quando tx_kind é 'invoice_payment'
-- ou 'transfer'. Antes era só convenção do código (pay_invoice e
-- transferências internas), agora vira regra do schema.
--
-- Pre-check: rodado em prod com 0 rows violando antes de aplicar.

alter table public.transactions
  add constraint chk_peer_implies_tx_kind
    check (
      transfer_peer_id is null
      or tx_kind in ('invoice_payment', 'transfer')
    );

comment on constraint chk_peer_implies_tx_kind on public.transactions is
  'Linkagem peer só vale para invoice_payment (pay_invoice RPC) e transfer (transferências internas). Bloqueia escritas ad-hoc inconsistentes.';
