/**
 * Bank logo resolution.
 *
 * Uses Google's s2/favicons service which is free, fast, and works for any
 * registered domain. Icons are 64×64 PNG/ICO and cached heavily by Google.
 *
 * For a richer experience later we could:
 *   - self-host SVG logos per bank (respects brand guidelines, offline-safe)
 *   - use Clearbit Logo API (was acquired by HubSpot — future uncertain)
 *   - ship Simple Icons for fintechs that provide brand kits
 */

const BANK_DOMAINS: Record<string, string> = {
  // Brazilian fintechs & neobanks
  nubank: "nubank.com.br",
  "mercado pago": "mercadopago.com.br",
  mercadopago: "mercadopago.com.br",
  inter: "inter.co",
  "banco inter": "inter.co",
  c6: "c6bank.com.br",
  "c6 bank": "c6bank.com.br",
  picpay: "picpay.com",
  original: "original.com.br",
  "will bank": "willbank.com.br",

  // Big brick-and-mortar banks
  itau: "itau.com.br",
  itaú: "itau.com.br",
  "banco itaú": "itau.com.br",
  bradesco: "bradesco.com.br",
  "banco bradesco": "bradesco.com.br",
  santander: "santander.com.br",
  "banco santander": "santander.com.br",
  "banco do brasil": "bb.com.br",
  bb: "bb.com.br",
  caixa: "caixa.gov.br",
  "caixa econômica": "caixa.gov.br",
  "caixa econômica federal": "caixa.gov.br",
  safra: "safra.com.br",
  "banco safra": "safra.com.br",
  votorantim: "bancovotorantim.com.br",

  // Investment brokers
  xp: "xp.com.br",
  "xp investimentos": "xp.com.br",
  rico: "rico.com.vc",
  btg: "btgpactual.com",
  "btg pactual": "btgpactual.com",
  "btg+": "btgpactualdigital.com",
  clear: "clear.com.br",
  "cm capital": "cmcapital.com.br",
  cmcapital: "cmcapital.com.br",

  // Crypto exchanges
  binance: "binance.com",
  coinbase: "coinbase.com",
  mercadobitcoin: "mercadobitcoin.com.br",
  "mercado bitcoin": "mercadobitcoin.com.br",
  bitso: "bitso.com",
  novadax: "novadax.com.br",
  foxbit: "foxbit.com.br",

  // Vale-benefício corporativo
  ticket: "ticket.com.br",
  "ticket vale-alimentação": "ticket.com.br",
  "ticket vale-refeição": "ticket.com.br",
  "ticket alimentação": "ticket.com.br",
  "ticket refeição": "ticket.com.br",
  sodexo: "sodexobeneficios.com.br",
  alelo: "alelo.com.br",
  "vr benefícios": "vr.com.br",
  "vr beneficios": "vr.com.br",
}

function normalize(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
}

function normalizeKeys(): Map<string, string> {
  const map = new Map<string, string>()
  for (const [key, domain] of Object.entries(BANK_DOMAINS)) {
    map.set(normalize(key), domain)
  }
  return map
}

const NORMALIZED = normalizeKeys()

/**
 * Returns an ordered list of candidate logo URLs for a bank (128px PNG via
 * Google favicons). Known banks map to a curated domain with highest
 * confidence; unknown names fall back to guessed TLDs derived from the name
 * slug. Consumers should walk the list with an onError handler so the img
 * gracefully tries the next candidate before giving up.
 */
export function bankLogoCandidates(bankName: string): string[] {
  const key = normalize(bankName)
  const candidates: string[] = []

  const known = findKnownDomain(key)
  if (known) candidates.push(googleFavicon(known))

  const slug = slugify(bankName)
  if (slug.length >= 2) {
    const compact = slug.replace(/-/g, "")
    for (const variant of new Set([slug, compact])) {
      candidates.push(googleFavicon(`${variant}.com.br`))
      candidates.push(googleFavicon(`${variant}.com`))
      candidates.push(googleFavicon(`${variant}.com.vc`))
    }
  }

  return Array.from(new Set(candidates))
}

/**
 * Returns the best-guess logo URL for the bank. Never returns null — unknown
 * banks fall back to a guessed domain so the UI can always try an icon and
 * use onError to switch to an icon/fallback if the attempt fails.
 */
export function bankLogoUrl(bankName: string): string | null {
  return bankLogoCandidates(bankName)[0] ?? null
}

function findKnownDomain(normalizedKey: string): string | null {
  const direct = NORMALIZED.get(normalizedKey)
  if (direct) return direct
  for (const [candidate, domain] of NORMALIZED.entries()) {
    if (
      normalizedKey === candidate ||
      normalizedKey.startsWith(`${candidate} `) ||
      normalizedKey.endsWith(` ${candidate}`) ||
      normalizedKey.includes(candidate)
    ) {
      return domain
    }
  }
  return null
}

function slugify(name: string): string {
  return normalize(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function googleFavicon(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`
}
