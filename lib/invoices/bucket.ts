// Lógica única e canônica de bucketing de fatura de cartão de crédito.
// Antes desse módulo, chargeInvoiceMonth/lumpSumInvoiceMonth e
// MONTHS_PT_LOWER estavam duplicados em 3+ arquivos (cartoes/page.tsx,
// cartoes/actions.ts, app/page.tsx) e em 9 declarações independentes
// de mês — divergência iminente. Tudo passa por aqui agora.

import { MONTHS_PT_LOWER } from "@/lib/time"

export function normalizeMerchant(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
}

// Extrai a "chave de banco" do nome de um cartão.
// "Nubank Cartão Platinum" → "nubank"
// "Caixa Econômica Federal Cartão" → "caixa"
// Usado pra correlacionar lump-sums em outras contas (merchant tipo
// "Nubank Cartão Abril 2026") com o cartão correto.
export function bankKeyOfCard(cardName: string): string {
  const cleaned = cardName.replace(/cart[ãa]o.*/i, "").trim()
  return normalizeMerchant(cleaned.split(/\s+/)[0] ?? "")
}

// Bucket de CHARGE itemized (compra direta no cartão).
// Respeita closing_day: dia ≤ closing → fatura do mês corrente;
// dia > closing → fatura do mês seguinte.
// closingDay null → bucket por mês-calendário.
// Retorna "YYYY-MM".
export function chargeInvoiceMonth(
  occurredOn: string,
  closingDay: number | null,
): string {
  if (closingDay == null) return occurredOn.slice(0, 7)
  const day = Number(occurredOn.slice(8, 10))
  if (day <= closingDay) return occurredOn.slice(0, 7)
  const [yStr, mStr] = occurredOn.slice(0, 7).split("-")
  const y = Number(yStr)
  const m = Number(mStr)
  const total = y * 12 + (m - 1) + 1
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return `${ny}-${String(nm).padStart(2, "0")}`
}

// Bucket de LUMP-SUM ou TRANSFER PAYMENT por mês mencionado no
// merchant ("Nubank Cartão Abril 2026" → "2026-04"; "Pagamento fatura
// · Maio 2026" → "2026-05"). Fallback: mês-calendário do occurredOn.
// Retorna "YYYY-MM".
export function merchantInvoiceMonth(
  merchant: string | null,
  fallbackOccurredOn: string,
): string {
  const m = normalizeMerchant(merchant)
  const yearMatch = m.match(/(20\d{2})/)
  if (!yearMatch) return fallbackOccurredOn.slice(0, 7)
  for (let i = 0; i < 12; i++) {
    if (m.includes(MONTHS_PT_LOWER[i]!)) {
      return `${yearMatch[1]}-${String(i + 1).padStart(2, "0")}`
    }
  }
  return fallbackOccurredOn.slice(0, 7)
}

// Parseia label do tipo "Nubank Cartão · Abril 2026" pra (mês, ano).
// Usado por payInvoiceAction quando precisa achar lump-sums agendados
// pra apagar / charges pra marcar como pagas.
export function parseInvoiceMonth(invoiceLabel: string): {
  monthName: string // sem acento, lowercase
  year: string
  invoiceYM: string // "2026-04"
} | null {
  const norm = normalizeMerchant(invoiceLabel)
  const yearMatch = norm.match(/(20\d{2})/)
  if (!yearMatch) return null
  for (let i = 0; i < 12; i++) {
    const monthName = MONTHS_PT_LOWER[i]!
    if (norm.includes(monthName)) {
      return {
        monthName,
        year: yearMatch[1]!,
        invoiceYM: `${yearMatch[1]}-${String(i + 1).padStart(2, "0")}`,
      }
    }
  }
  return null
}
