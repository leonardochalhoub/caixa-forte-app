// Helpers e tipos do Balanço Contábil. Antes viviam inline no
// relatorios/balanco/page.tsx (1255L). Movidos pra cá pra reduzir
// god-file e permitir reuso/teste. Tipos foram migrados pra
// `balanco-types.ts` e re-exportados aqui pra manter compat de imports.

import { MONTH_NAMES_PT } from "@/lib/time"

export {
  TYPE_CLASSIFICATION,
  SECTION_LABELS,
  type AccountRow,
  type AdjRow,
  type Bucket,
  type ClassificationKey,
  type Line,
  type OverdueLine,
  type RegistryRow,
  type SearchParams,
  type Tx,
} from "./balanco-types"

// "mensal:2026-04" | "anual:2026"
// snapshotDate é o MIN entre (último dia do período) e (hoje) — se
// estamos dentro do período em questão, tira retrato no dia de hoje;
// se o período já acabou, usa o fim dele; se o período é futuro, usa
// o fim dele também (projeção, edge case raro).
export function parsePeriod(p: string): {
  kind: "mensal" | "anual"
  year: number
  month?: number
  snapshotDate: string
  label: string
} {
  const now = new Date()
  const todayYmd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
  if (p.startsWith("anual:")) {
    const y = Number(p.slice(6))
    const endOfYear = `${y}-12-31`
    const snapshotDate = todayYmd < endOfYear ? todayYmd : endOfYear
    return {
      kind: "anual",
      year: y,
      snapshotDate,
      label: `Anual ${y}`,
    }
  }
  const ym = p.startsWith("mensal:") ? p.slice(7) : p
  const [yStr, mStr] = ym.split("-")
  const y = Number(yStr)
  const m = Number(mStr)
  const lastDay = new Date(y, m, 0).getDate()
  const endOfMonth = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
  const snapshotDate = todayYmd < endOfMonth ? todayYmd : endOfMonth
  return {
    kind: "mensal",
    year: y,
    month: m,
    snapshotDate,
    label: `${MONTH_NAMES_PT[m - 1]} ${y}`,
  }
}
