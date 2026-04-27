# ADR 0001 — Cartão de crédito modelado como Account

**Status**: Aceito · 2026-02 (revisado pós-Conselho v2 em 2026-04)

## Contexto

Aplicativos de finanças tradicionais (Mobills, Organizze) modelam cartão
de crédito como entidade separada de conta. Usuário tem `accounts`,
`credit_cards`, `invoices`, `charges` em tabelas distintas, e fatura é
uma agregação calculada.

## Decisão

Caixa Forte modela cartão de crédito como mais um row em `accounts`
com `type='credit'`. Charges são `transactions` no `account_id` do
cartão. Fatura é um conceito **virtual** — bucket calculado por
`closing_day` + `occurred_on` em runtime.

## Consequências

### Vantagens

- **Esquema uniforme**: queries de saldo, extrato, balanço passam por
  uma única tabela `transactions`. Não há união entre `tx` e `charges`.
- **RLS único**: política de `transactions` cobre cartão automaticamente.
- **Pagamento de fatura é uma transferência**: `pay_invoice` RPC cria
  par expense+income com `transfer_peer_id`, modelo igual a transferência
  bancária. Reaproveita `void_transfer` etc.
- **Total simplification**: total de dívida = soma de charges não-pagas
  no cartão. Não precisa joinar `invoices` + `charges` + `payments`.

### Desvantagens

- **Saldo do cartão é negativo** (representa dívida). Display precisa
  diferenciar pra UX.
- **Bucket de fatura por string-match no merchant** (legado de pre-0036)
  — mitigado pelo `tx_kind='charge'` + `closing_day` em `chargeInvoiceMonth()`.
  Conselho de Finanças sugeriu tabela `invoices(id, card_id, ym)` futura
  pra eliminar string-match completamente.
- **Parcelamento não modelado** — N charges com merchant igual no momento.
  Aceito como dívida técnica até alguém pedir relatório de "parcelas
  abertas".

## Referências

- `supabase/migrations/0001_init_schema.sql:35` (tipo `credit` no CHECK)
- `supabase/migrations/0026_credit_card_closing_day.sql`
- `supabase/migrations/0035_pay_invoice_atomic.sql`
- `lib/invoices/bucket.ts` (chargeInvoiceMonth)
