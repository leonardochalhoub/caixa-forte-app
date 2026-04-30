// Sub-componentes de UI do Balanço Contábil — extraídos do
// page.tsx pra reduzir god-file. Pure presentation, nenhum data
// fetching aqui.

import { formatBRL } from "@/lib/money"
import { AdjustmentActions, type Adjustment } from "./AdjustmentForm"

export function SectionHeader({
  title,
  total,
}: {
  title: string
  total: number
}) {
  return (
    <div className="flex items-baseline justify-between border-b border-border pb-1">
      <span className="text-xs font-semibold uppercase tracking-wider text-strong">
        {title}
      </span>
      <span className="font-mono text-sm font-semibold tabular-nums text-strong">
        {formatBRL(total)}
      </span>
    </div>
  )
}

export function SubSectionHeader({
  title,
  total,
}: {
  title: string
  total: number
}) {
  return (
    <div className="mt-2 flex items-baseline justify-between pl-3">
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted">
        {title}
      </span>
      <span className="font-mono text-xs font-medium tabular-nums text-body">
        {formatBRL(total)}
      </span>
    </div>
  )
}

export function AdjList({
  items,
  hint,
}: {
  items: Adjustment[]
  hint?: string
}) {
  if (items.length === 0) return null
  // Estrutura idêntica ao Bucket (ul com pl-7), pra manter alinhamento
  // vertical das contas e dos ajustes. Actions de editar/remover
  // ficam num slot absoluto ao lado, sem empurrar o valor.
  return (
    <>
      {hint && (
        <p className="pl-7 text-[10px] uppercase tracking-wider text-muted">
          {hint}
        </p>
      )}
      <ul className="space-y-0.5 pl-7">
        {items.map((a) => {
          const readonly = a.readonly_source != null
          return (
            <li
              key={a.id}
              className="group relative flex items-baseline justify-between gap-3 text-[11px] text-muted"
            >
              <span className="flex min-w-0 flex-1 items-baseline gap-1">
                <span>↳</span>
                <span className="truncate">{a.label}</span>
                {a.note && !readonly && (
                  <span
                    className="shrink-0 cursor-help text-[9px]"
                    title={a.note}
                  >
                    ⓘ
                  </span>
                )}
              </span>
              <span className="shrink-0 font-mono tabular-nums">
                {formatBRL(a.amount_cents)}
              </span>
              {!readonly && (
                // Antes ficava opacity-0 com group-hover pra reaparecer.
                // Mas mobile não tem hover — user não conseguia deletar.
                // Agora sempre visível mas discreto (opacity-50) e fica
                // 100% no hover/focus.
                <span className="no-print shrink-0 pl-2 opacity-50 transition-opacity hover:opacity-100 focus-within:opacity-100">
                  <AdjustmentActions adjustment={a} />
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}

export function Bucket({
  bucket,
}: {
  bucket:
    | {
        key: string
        label: string
        lines: { accountId: string; accountName: string; cents: number }[]
        total: number
      }
    | undefined
}) {
  if (!bucket || bucket.lines.length === 0) return null
  // Renderiza só as linhas (contas). O título + total do bucket já é
  // mostrado pelo SubSectionHeader no nível acima — evita duplicação.
  return (
    <ul className="space-y-0.5 pl-7">
      {[...bucket.lines]
        .sort((a, b) => b.cents - a.cents)
        .map((l) => (
          <li
            key={l.accountId}
            className="flex items-baseline justify-between gap-3 text-[11px] text-muted"
          >
            <span className="min-w-0 flex-1 truncate">↳ {l.accountName}</span>
            <span className="shrink-0 font-mono tabular-nums">
              {formatBRL(l.cents)}
            </span>
          </li>
        ))}
    </ul>
  )
}
