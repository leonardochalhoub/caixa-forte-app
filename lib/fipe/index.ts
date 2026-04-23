// Cliente minimal da Parallelum FIPE v2 — público, sem auth.
// Docs: https://deividfortuna.github.io/fipe/

const BASE = "https://parallelum.com.br/fipe/api/v2"

export type VehicleType = "cars" | "motorcycles" | "trucks"

export interface FipeMetadata {
  source: "fipe"
  vehicle_type: VehicleType
  fipe_code: string
  brand_id: number
  brand_name: string
  model_id: number
  model_name: string
  year_id: string
  year_label: string
  last_checked_at?: string
  last_reference_month?: string
}

export interface FipePriceResult {
  price: string // ex "R$ 39.324,00"
  priceCents: number // ex 3932400
  referenceMonth: string // ex "abril de 2026"
  brand: string
  model: string
  modelYear: number
  codeFipe: string
}

function priceStringToCents(priceStr: string): number {
  // "R$ 39.324,00" → 3932400
  const clean = priceStr
    .replace(/[^\d,]/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
  const reais = Number(clean)
  if (!Number.isFinite(reais)) return 0
  return Math.round(reais * 100)
}

export async function fetchFipePrice(meta: FipeMetadata): Promise<FipePriceResult> {
  const url = `${BASE}/${meta.vehicle_type}/brands/${meta.brand_id}/models/${meta.model_id}/years/${meta.year_id}`
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    // FIPE costuma cachear 1 mês — safe pra reusar por algumas horas
    next: { revalidate: 3600 },
  })
  if (!res.ok) {
    throw new Error(`FIPE ${res.status} ao buscar ${meta.fipe_code}`)
  }
  const json = (await res.json()) as {
    price: string
    referenceMonth: string
    brand: string
    model: string
    modelYear: number
    codeFipe: string
  }
  return {
    price: json.price,
    priceCents: priceStringToCents(json.price),
    referenceMonth: json.referenceMonth,
    brand: json.brand,
    model: json.model,
    modelYear: json.modelYear,
    codeFipe: json.codeFipe,
  }
}
