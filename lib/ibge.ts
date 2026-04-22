// IBGE municipalities — fetched once from the public IBGE API and cached in
// localStorage so the picker stays snappy across navigations. The endpoint
// has no auth, is served from government CDN, and is the canonical source.

export interface IbgeCity {
  id: number
  name: string
  uf: string
}

const CACHE_KEY = "cfx:ibge:cities:v1"
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
const IBGE_URL =
  "https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome"

type Cached = { fetchedAt: number; cities: IbgeCity[] }

let inMemory: Promise<IbgeCity[]> | null = null

export async function loadIbgeCities(): Promise<IbgeCity[]> {
  if (typeof window === "undefined") return []
  if (inMemory) return inMemory

  inMemory = (async () => {
    const cached = readCache()
    if (cached) return cached

    const res = await fetch(IBGE_URL, { cache: "force-cache" })
    if (!res.ok) throw new Error(`IBGE fetch falhou (${res.status})`)
    const raw: Array<{
      id: number
      nome: string
      microrregiao?: {
        mesorregiao?: { UF?: { sigla?: string } }
      }
    }> = await res.json()

    const cities: IbgeCity[] = raw.map((r) => ({
      id: r.id,
      name: r.nome,
      uf: r.microrregiao?.mesorregiao?.UF?.sigla ?? "",
    }))

    writeCache({ fetchedAt: Date.now(), cities })
    return cities
  })()

  return inMemory
}

function readCache(): IbgeCity[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Cached
    if (!parsed?.cities?.length) return null
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null
    return parsed.cities
  } catch {
    return null
  }
}

function writeCache(value: Cached) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(value))
  } catch {
    // localStorage full — skip, next load refetches.
  }
}

// Accent-insensitive match helper. Used by the picker's search box.
export function normalizeSearch(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
}

export const BR_STATES: ReadonlyArray<{ uf: string; name: string }> = [
  { uf: "AC", name: "Acre" },
  { uf: "AL", name: "Alagoas" },
  { uf: "AP", name: "Amapá" },
  { uf: "AM", name: "Amazonas" },
  { uf: "BA", name: "Bahia" },
  { uf: "CE", name: "Ceará" },
  { uf: "DF", name: "Distrito Federal" },
  { uf: "ES", name: "Espírito Santo" },
  { uf: "GO", name: "Goiás" },
  { uf: "MA", name: "Maranhão" },
  { uf: "MT", name: "Mato Grosso" },
  { uf: "MS", name: "Mato Grosso do Sul" },
  { uf: "MG", name: "Minas Gerais" },
  { uf: "PA", name: "Pará" },
  { uf: "PB", name: "Paraíba" },
  { uf: "PR", name: "Paraná" },
  { uf: "PE", name: "Pernambuco" },
  { uf: "PI", name: "Piauí" },
  { uf: "RJ", name: "Rio de Janeiro" },
  { uf: "RN", name: "Rio Grande do Norte" },
  { uf: "RS", name: "Rio Grande do Sul" },
  { uf: "RO", name: "Rondônia" },
  { uf: "RR", name: "Roraima" },
  { uf: "SC", name: "Santa Catarina" },
  { uf: "SP", name: "São Paulo" },
  { uf: "SE", name: "Sergipe" },
  { uf: "TO", name: "Tocantins" },
]

// Approximate state-capital coordinates (lat, lng). Used by the sysadmin
// map to place state-level markers without needing a per-city lat/lng table.
export const UF_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  AC: { lat: -9.9747, lng: -67.8243 },
  AL: { lat: -9.6498, lng: -35.7089 },
  AP: { lat: 0.034, lng: -51.0694 },
  AM: { lat: -3.119, lng: -60.0217 },
  BA: { lat: -12.9714, lng: -38.5014 },
  CE: { lat: -3.7319, lng: -38.5267 },
  DF: { lat: -15.7939, lng: -47.8828 },
  ES: { lat: -20.3155, lng: -40.3128 },
  GO: { lat: -16.6869, lng: -49.2648 },
  MA: { lat: -2.5307, lng: -44.3068 },
  MT: { lat: -15.601, lng: -56.0979 },
  MS: { lat: -20.4697, lng: -54.6201 },
  MG: { lat: -19.9167, lng: -43.9345 },
  PA: { lat: -1.4558, lng: -48.4902 },
  PB: { lat: -7.1195, lng: -34.845 },
  PR: { lat: -25.4284, lng: -49.2733 },
  PE: { lat: -8.0476, lng: -34.877 },
  PI: { lat: -5.0892, lng: -42.8019 },
  RJ: { lat: -22.9068, lng: -43.1729 },
  RN: { lat: -5.7945, lng: -35.211 },
  RS: { lat: -30.0346, lng: -51.2177 },
  RO: { lat: -8.7619, lng: -63.9039 },
  RR: { lat: 2.8235, lng: -60.6758 },
  SC: { lat: -27.5954, lng: -48.548 },
  SP: { lat: -23.5505, lng: -46.6333 },
  SE: { lat: -10.9472, lng: -37.0731 },
  TO: { lat: -10.1837, lng: -48.3336 },
}
