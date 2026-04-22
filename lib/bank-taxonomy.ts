// Known sub-account suffixes used to derive the "bank" vs. "sub-account"
// pieces of an account name (e.g. "Caixa Econômica Federal FGTS" -> bank
// "Caixa Econômica Federal", sub "FGTS"). Order matters — longest first so
// "Renda Variável" wins over "Variável".

const KNOWN_SUFFIXES = [
  "Conta Corrente",
  "Renda Variável",
  "Renda Fixa",
  "Cartão de Crédito",
  "Cartão",
  "Poupança",
  "Cripto",
  "FGTS",
  "Conta",
  "Variável",
  "Fixa",
  "Corrente",
]

// Loose B3-ticker pattern (e.g. PETR4, IRBR3, VALE3F). Captures 4 uppercase
// letters + 1–2 digits + optional trailing letter — enough for equities and
// FIIs without matching ordinary words.
const TICKER_RE = /\s+([A-Z]{4}\d{1,2}[A-Z]?)$/

export function splitBankAndSub(accountName: string): {
  bank: string
  sub: string | null
} {
  const trimmed = accountName.trim()

  for (const suffix of KNOWN_SUFFIXES) {
    const re = new RegExp(`\\s+${escapeRegex(suffix)}$`, "i")
    if (re.test(trimmed)) {
      const bank = trimmed.replace(re, "").trim()
      if (bank.length >= 2) return { bank, sub: suffix }
    }
  }

  const tickerMatch = trimmed.match(TICKER_RE)
  if (tickerMatch) {
    const bank = trimmed.slice(0, tickerMatch.index).trim()
    if (bank.length >= 2) return { bank, sub: tickerMatch[1]! }
  }

  return { bank: trimmed, sub: null }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

// Known short aliases for Brazilian bank names — used in tight layouts where
// the full name would truncate badly. Keys are lowercased, accent-stripped.
const BANK_ALIASES: Record<string, string> = {
  "caixa economica federal": "CEF",
  "caixa econômica federal": "CEF",
  "caixa economica": "CEF",
  "caixa econômica": "CEF",
  caixa: "CEF",
  "banco do brasil": "BB",
  "banco itau": "Itaú",
  "banco itaú": "Itaú",
  "banco bradesco": "Bradesco",
  "banco santander": "Santander",
  "banco inter": "Inter",
  "banco safra": "Safra",
  "xp investimentos": "XP",
  "btg pactual": "BTG",
  "mercado pago": "Mercado Pago",
  "mercado bitcoin": "Mercado BTC",
  "nu pagamentos": "Nubank",
  "cm capital": "CM Capital",
}

function normalizeAliasKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
}

/**
 * Returns a short form of the bank name suitable for tight layouts. Falls
 * back to the original when the full name is short enough or no alias is
 * registered. Threshold defaults to 18 chars.
 */
export function shortBankName(bankName: string, maxChars = 18): string {
  const trimmed = bankName.trim()
  if (trimmed.length <= maxChars) return trimmed
  const alias = BANK_ALIASES[normalizeAliasKey(trimmed)]
  return alias ?? trimmed
}
