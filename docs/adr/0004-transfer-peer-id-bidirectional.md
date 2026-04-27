# ADR 0004 — Transferências internas via `transfer_peer_id` self-FK

**Status**: Aceito · 2026-04 (CHECK constraint adicionada em 0047)

## Contexto

Transferências internas (entre contas do próprio user) e pagamentos de
fatura criam **2 transactions** vinculadas: uma expense (origem) e uma
income (destino). Sem ligação explícita, é impossível:
- Saber o "outro lado" de uma transfer
- Implementar `void_transfer` (que apaga par)
- Filtrar transfer pairs em relatórios DRE/conciliação

## Decisão

Adicionamos `transactions.transfer_peer_id uuid REFERENCES transactions(id)`
self-FK com `ON DELETE SET NULL`. Cada lado da transferência aponta pro
outro.

CHECK constraint `chk_peer_implies_tx_kind` (0047) enforça:
> `transfer_peer_id IS NULL OR tx_kind IN ('invoice_payment', 'transfer')`

## Consequências

### Vantagens

- **Lookup O(1)**: dado tx_id, peer = `tx.transfer_peer_id`. Sem query
  custosa por timestamp+amount.
- **`void_transfer` atomico**: apaga peer primeiro, depois o principal,
  evitando ciclo de FK.
- **CHECK constraint** virou invariante de schema, não convenção de
  código (Conselho v2 reforçou).

### Desvantagens

- **Sem constraint de simetria** (A.peer=B ⇒ B.peer=A). Schema não
  garante. Triggers UPDATE poderiam adicionar mas não há ainda
  (Conselho v2 sugere; aceito como dívida menor).
- **Backfill loose** (0045) tentou linkar pares órfãos demos da Larissa
  sem janela de tempo — uniqueness exigida por linha. Resultou em 0
  pares novos linkados (orfãos eram unilaterais reais). Documentado
  como migration data-touching com salvaguarda implícita.

## Referências

- `supabase/migrations/0038_transfer_peer_id.sql` (cria coluna)
- `supabase/migrations/0039_pay_invoice_links_peer.sql` (RPC popula)
- `supabase/migrations/0043_void_transfer_rpc.sql` (consome FK)
- `supabase/migrations/0045_transfer_peer_backfill_loose.sql` (cleanup)
- `supabase/migrations/0047_chk_peer_implies_tx_kind.sql` (CHECK)
