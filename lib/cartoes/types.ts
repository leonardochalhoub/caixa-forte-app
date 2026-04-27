// Tipos canônicos da página /app/cartoes — extraídos do god-file pra
// permitir helpers puros em lib/cartoes/helpers.ts e subcomponente
// InvoiceRow em _components/. Server-side only (sem React).

export type CardTx = {
  id: string
  account_id: string
  type: "income" | "expense"
  amount_cents: number
  occurred_on: string
  created_at: string
  merchant: string | null
  paid_at: string | null
  is_transfer: boolean | null
  tx_kind: "charge" | "invoice_payment" | "refund" | "fee" | "transfer" | null
  category_id: string | null
}

export type Category = {
  id: string
  name: string
  parent_id: string | null
}

export type AccountLite = {
  id: string
  name: string
}

export type CardRow = {
  id: string
  name: string
  opening_balance_cents: number | null
  created_at: string
  closing_day?: number | null
}

// Linha apresentada dentro da fatura (compra itemizada, lump-sum
// agendado ou transfer payment "pagamento").
export type InvoiceCharge = {
  id: string
  amount_cents: number
  occurred_on: string
  created_at: string
  merchant: string | null
  paid_at: string | null
  isLumpSum: boolean
  isInvoicePayment?: boolean
  accountName: string
  categoryLabel: string | null
}

export type MonthBucket = {
  lumpSumCents: number
  itemized: InvoiceCharge[]
  lumpSumEntries: InvoiceCharge[]
  paidCents: number
  // Pagamentos via transfer pair (botão "Pagar"). Independente
  // do lump-sum agendado.
  transferPaidCents: number
}

export type Invoice = {
  key: string
  label: string
  totalCents: number
  itemizedCents: number
  lumpSumCents: number
  paidCents: number
  openCents: number
  itemized: InvoiceCharge[]
  lumpSumEntries: InvoiceCharge[]
}

export type CardInvoiceSummary = {
  card: CardRow
  invoices: Invoice[]
  openDebtCents: number
}
