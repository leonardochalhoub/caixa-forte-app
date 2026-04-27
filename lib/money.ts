const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
})

const BRL_NO_SYMBOL = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function toCents(reais: number): number {
  if (!Number.isFinite(reais)) throw new RangeError("valor inválido")
  return Math.round(reais * 100)
}

export function toReais(cents: number | bigint): number {
  const n = typeof cents === "bigint" ? Number(cents) : cents
  return n / 100
}

export function formatBRL(cents: number | bigint): string {
  return BRL.format(toReais(cents))
}

export function formatBRLWithoutSymbol(cents: number | bigint): string {
  return BRL_NO_SYMBOL.format(toReais(cents))
}

// Versão "lida em voz alta" pra leitores de tela. Sem símbolo R$ truncado
// pra "R cifrão", sem vírgula como separador silencioso. Conselheira de
// Design flagou WCAG: aria-label tem que falar valor de forma natural.
export function formatBRLForScreenReader(cents: number | bigint): string {
  const reais = toReais(cents)
  const negative = reais < 0
  const absVal = Math.abs(reais)
  const intPart = Math.floor(absVal)
  const centsPart = Math.round((absVal - intPart) * 100)
  const intStr = intPart.toLocaleString("pt-BR")
  if (centsPart === 0) {
    return `${negative ? "menos " : ""}${intStr} ${intPart === 1 ? "real" : "reais"}`
  }
  return `${negative ? "menos " : ""}${intStr} ${intPart === 1 ? "real" : "reais"} e ${centsPart} centavos`
}

export function parseBRLToCents(input: string): number | null {
  const stripped = input.trim().replace(/^r\$/i, "").trim()
  if (!stripped) return null

  const negative = stripped.startsWith("-")
  const body = negative ? stripped.slice(1).trim() : stripped
  const sign = negative ? -1 : 1

  if (body.includes(",")) {
    const [intPart, decPart, ...rest] = body.split(",")
    if (rest.length > 0 || !intPart || decPart === undefined) return null
    const digits = intPart.replace(/\./g, "")
    if (!/^\d+$/.test(digits)) return null
    if (!/^\d{1,2}$/.test(decPart)) return null
    const cents = parseInt(digits, 10) * 100 + parseInt(decPart.padEnd(2, "0"), 10)
    return sign * cents
  }

  if (/^\d+\.\d{1,2}$/.test(body)) {
    return sign * toCents(Number(body))
  }
  if (/^\d+$/.test(body)) {
    return sign * parseInt(body, 10) * 100
  }
  return null
}
