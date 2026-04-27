import { formatInTimeZone, toZonedTime } from "date-fns-tz"
import { addDays, format, parse, startOfMonth, subMonths } from "date-fns"

export const APP_TIMEZONE = process.env.APP_TIMEZONE ?? "America/Sao_Paulo"

export function nowInSaoPaulo(): Date {
  return toZonedTime(new Date(), APP_TIMEZONE)
}

export function todayIsoDate(now?: Date): string {
  const d = now ? toZonedTime(now, APP_TIMEZONE) : nowInSaoPaulo()
  return format(d, "yyyy-MM-dd")
}

export function formatPtBrDate(isoDate: string): string {
  return format(parse(isoDate, "yyyy-MM-dd", new Date()), "dd/MM/yyyy")
}

export function formatPtBrDateShort(isoDate: string): string {
  return format(parse(isoDate, "yyyy-MM-dd", new Date()), "dd/MM")
}

// "DD/MM HH:MM" — combina occurred_on (date) com time-of-day de um
// timestamptz (geralmente created_at). Usado nas tabelas de transação
// pra dar contexto temporal além da data.
export function formatPtBrDateTimeShort(
  isoDate: string,
  timestampTz?: string | null,
): string {
  const datePart = formatPtBrDateShort(isoDate)
  if (!timestampTz) return datePart
  try {
    const time = formatInTimeZone(new Date(timestampTz), APP_TIMEZONE, "HH:mm")
    return `${datePart} ${time}`
  } catch {
    return datePart
  }
}

export function currentMonthRange(now?: Date): { start: string; end: string } {
  const d = now ?? nowInSaoPaulo()
  const start = startOfMonth(d)
  const end = addDays(startOfMonth(addDays(start, 32)), -1)
  return {
    start: format(start, "yyyy-MM-dd"),
    end: format(end, "yyyy-MM-dd"),
  }
}

export function last6MonthsStart(now?: Date): string {
  const d = now ?? nowInSaoPaulo()
  return format(startOfMonth(subMonths(d, 5)), "yyyy-MM-dd")
}

export function resolveRelativeDate(phrase: string, now?: Date): string | null {
  const today = now ? toZonedTime(now, APP_TIMEZONE) : nowInSaoPaulo()
  const normalized = phrase.trim().toLowerCase()

  if (normalized === "hoje") return format(today, "yyyy-MM-dd")
  if (normalized === "ontem") return format(addDays(today, -1), "yyyy-MM-dd")
  if (normalized === "anteontem") return format(addDays(today, -2), "yyyy-MM-dd")
  if (normalized === "amanhã" || normalized === "amanha") return format(addDays(today, 1), "yyyy-MM-dd")

  const diaN = normalized.match(/^dia\s+(\d{1,2})$/)
  if (diaN) {
    const dayNum = parseInt(diaN[1]!, 10)
    if (dayNum >= 1 && dayNum <= 31) {
      const year = today.getFullYear()
      const month = today.getMonth()
      const candidate = new Date(year, month, dayNum)
      return format(candidate, "yyyy-MM-dd")
    }
  }

  const isoLiteral = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoLiteral) return normalized

  const brLiteral = normalized.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/)
  if (brLiteral) {
    const day = brLiteral[1]!.padStart(2, "0")
    const month = brLiteral[2]!.padStart(2, "0")
    const year = brLiteral[3] ?? String(today.getFullYear())
    return `${year}-${month}-${day}`
  }

  return null
}

export function formatInSaoPaulo(date: Date, pattern = "yyyy-MM-dd HH:mm"): string {
  return formatInTimeZone(date, APP_TIMEZONE, pattern)
}

// Meses pt-BR com capital — usado em labels de UI ("Janeiro 2026").
export const MONTH_NAMES_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const

// Meses pt-BR sem acento, lowercase — usado pra match case-insensitive
// em strings de merchant tipo "Nubank Cartão Marco 2026" (sem acento
// já que normalizamos via NFD).
export const MONTHS_PT_LOWER = [
  "janeiro",
  "fevereiro",
  "marco",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const

// Mes (1..12) → 0-based index do array de meses; -1 se não bate.
export function monthIndexFromName(name: string): number {
  const norm = name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
  return MONTHS_PT_LOWER.indexOf(norm as (typeof MONTHS_PT_LOWER)[number])
}

// "yyyy-MM" → start (1º dia), end (1º dia do mês seguinte, exclusive),
// label pt-BR ("Abril 2026"). Usado em relatórios mensais.
export function monthBounds(ym: string): { start: string; end: string; label: string } {
  const [yStr, mStr] = ym.split("-")
  const y = Number(yStr)
  const m = Number(mStr)
  const start = `${y}-${String(m).padStart(2, "0")}-01`
  const nextMonth =
    m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`
  return {
    start,
    end: nextMonth,
    label: `${MONTH_NAMES_PT[m - 1]} ${y}`,
  }
}
