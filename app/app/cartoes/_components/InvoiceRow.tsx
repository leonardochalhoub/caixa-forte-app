// Subcomponente Server-only que renderiza UMA fatura mensal:
// header (label + status + Pagar) + lista de entries (lump-sum
// agendados, transfer payments, charges itemizados). Extraído do
// god-file pra page.tsx ficar < 300 linhas. Sem state, sem hooks.

import Link from "next/link"
import { formatBRL } from "@/lib/money"
import { formatPtBrDateTimeShort } from "@/lib/time"
import { invoiceStatusKind } from "@/lib/cartoes/helpers"
import type { Invoice } from "@/lib/cartoes/types"
import { PayInvoiceButton } from "./PayInvoiceButton"
import { VoidInvoicePaymentButton } from "./VoidInvoicePaymentButton"

export function InvoiceRow({
  invoice,
  cardId,
  cardName,
  checkingAccounts,
}: {
  invoice: Invoice
  cardId: string
  cardName: string
  checkingAccounts: { id: string; name: string }[]
}) {
  const allEntries = [...invoice.lumpSumEntries, ...invoice.itemized]
  const kind = invoiceStatusKind(invoice)
  // Glifo redundante a cor (Conselheira de Design): daltonismo deuteranopia
  // (~6% homens BR) lê verde/vermelho como tons iguais. ✓ / ● / ○ resolve.
  const status =
    kind === "paid"
      ? { label: "PAGA", glyph: "✓", className: "text-income" }
      : kind === "partial"
        ? {
            label: `${formatBRL(invoice.openCents)} em aberto`,
            glyph: "●",
            className: "text-amber-600 dark:text-amber-400",
          }
        : { label: "EM ABERTO", glyph: "○", className: "text-expense" }

  return (
    <li className="space-y-2 rounded-xl border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-strong">
            Fatura {invoice.label}
          </p>
          <p className="text-xs text-muted">
            {invoice.lumpSumCents > 0 && invoice.itemizedCents > 0 ? (
              <>
                Base{" "}
                <span className="font-mono text-body">
                  {formatBRL(invoice.lumpSumCents)}
                </span>
                {" + "}
                {invoice.itemized.length} compra
                {invoice.itemized.length === 1 ? "" : "s"}{" "}
                <span className="font-mono text-body">
                  {formatBRL(invoice.itemizedCents)}
                </span>
                {" = "}
                <span className="font-mono font-semibold text-strong">
                  {formatBRL(invoice.totalCents)}
                </span>
              </>
            ) : (
              <>
                Total{" "}
                <span className="font-mono font-semibold text-strong">
                  {formatBRL(invoice.totalCents)}
                </span>
              </>
            )}
            {invoice.paidCents > 0 && ` · pago ${formatBRL(invoice.paidCents)}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p
            className={`flex items-center gap-1.5 font-mono text-base font-semibold tabular-nums ${status.className}`}
          >
            <span aria-hidden>{status.glyph}</span>
            {status.label}
          </p>
          {invoice.openCents > 0 && (
            <PayInvoiceButton
              cardId={cardId}
              cardName={cardName}
              invoiceLabel={invoice.label}
              invoiceKey={invoice.key}
              amountCents={invoice.openCents}
              checkingAccounts={checkingAccounts}
            />
          )}
        </div>
      </div>

      {allEntries.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border text-xs">
          {allEntries.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-3 py-1.5">
              <Link
                href={`/app/transacoes/${t.id}`}
                className="flex min-w-0 flex-1 items-center gap-2 text-body hover:text-strong"
              >
                <span className="shrink-0 tabular-nums">
                  {formatPtBrDateTimeShort(t.occurred_on, t.created_at)}
                </span>
                <span className="truncate">
                  {t.merchant ?? "(sem merchant)"}
                </span>
                {t.categoryLabel ? (
                  <span className="shrink-0 truncate rounded-full border border-border bg-subtle px-1.5 py-0.5 text-[9px] tracking-wide text-body">
                    {t.categoryLabel}
                  </span>
                ) : !t.isInvoicePayment && (
                  <span className="shrink-0 truncate rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-amber-600 dark:text-amber-400">
                    sem categoria
                  </span>
                )}
                <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted">
                  · {t.accountName}
                </span>
                {t.isLumpSum && (
                  <span className="shrink-0 rounded-full border border-border bg-subtle px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-body">
                    fatura
                  </span>
                )}
                {t.isInvoicePayment && (
                  <span className="shrink-0 rounded-full border border-income/40 bg-income/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-income">
                    pagamento
                  </span>
                )}
                {t.paid_at ? (
                  <span className="shrink-0 rounded-full border border-income/40 bg-income/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-income">
                    paga
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-amber-600 dark:text-amber-400">
                    a pagar
                  </span>
                )}
              </Link>
              <span
                className={`shrink-0 font-mono tabular-nums ${
                  t.isInvoicePayment ? "text-income" : "text-expense"
                }`}
              >
                {t.isInvoicePayment ? "+" : "−"} {formatBRL(t.amount_cents)}
              </span>
              {t.isInvoicePayment && (
                <VoidInvoicePaymentButton
                  txId={t.id}
                  amountCents={t.amount_cents}
                  invoiceLabel={invoice.label}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
