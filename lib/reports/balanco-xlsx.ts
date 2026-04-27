// Builder das linhas do export XLSX do Balanço. Antes vivia inline
// no app/relatorios/balanco/page.tsx (~115L).

import type { AdjustmentsBySection, BalancoTotals } from "./balanco-helpers"
import type {
  Bucket,
  ClassificationKey,
  OverdueLine,
  RegistryRow,
} from "./balanco-types"

export type XlsxRow = (string | number)[]

export function buildBalancoXlsxRows(args: {
  periodLabel: string
  snapshotDate: string
  buckets: Map<ClassificationKey, Bucket>
  adjustmentsBySection: AdjustmentsBySection
  totals: BalancoTotals
  overdueLiabilities: OverdueLine[]
  registries: RegistryRow[]
  sumAdj: (section: string) => number
}): XlsxRow[] {
  const {
    periodLabel,
    snapshotDate,
    buckets,
    adjustmentsBySection,
    totals,
    overdueLiabilities,
    registries,
    sumAdj,
  } = args

  const ativoCirculanteDisponivel = buckets.get("ativo_circulante_disponivel")
  const ativoCirculanteRendaFixa = buckets.get("ativo_circulante_renda_fixa")
  const ativoCirculanteRendaVar = buckets.get("ativo_circulante_renda_variavel")
  const ativoCirculanteCripto = buckets.get("ativo_circulante_cripto")
  const ativoNCBloqueado = buckets.get("ativo_nc_bloqueado")
  const passivoCartoes = buckets.get("passivo_circulante_cartoes")

  const rows: XlsxRow[] = []
  const pushLine = (label: string, value: number) =>
    rows.push([label, value / 100])
  const pushHeader = (label: string) => rows.push([label])
  const pushGap = () => rows.push([])
  const pushBucketLines = (
    bucket?: { lines: { accountName: string; cents: number }[] },
  ) => {
    for (const l of bucket?.lines ?? [])
      pushLine(`      ↳ ${l.accountName}`, l.cents)
  }
  const pushAdjLines = (section: string) => {
    for (const a of adjustmentsBySection.get(section) ?? [])
      pushLine(`      ↳ ${a.label}`, a.amount_cents)
  }
  const pushSubsection = (
    title: string,
    total: number,
    bucket: { lines: { accountName: string; cents: number }[] } | undefined,
    adjSections: string[],
    show = true,
  ) => {
    if (!show) return
    pushLine(`    ${title}`, total)
    pushBucketLines(bucket)
    for (const s of adjSections) pushAdjLines(s)
  }

  rows.push(["Balanço Contábil", periodLabel, "", "Snapshot", snapshotDate])
  pushGap()

  // ATIVO
  pushHeader("ATIVO")
  pushHeader("  Ativo Circulante")
  pushSubsection(
    "Disponibilidades",
    totals.ativoCirculanteDisponivelTotal,
    ativoCirculanteDisponivel,
    ["ativo_circulante_disponivel", "ativo_circulante_outros"],
  )
  pushSubsection(
    "Aplicações de Renda Fixa",
    totals.ativoCirculanteRendaFixaTotal,
    ativoCirculanteRendaFixa,
    ["ativo_circulante_renda_fixa"],
  )
  pushSubsection(
    "Renda Variável",
    totals.ativoCirculanteRendaVarTotal,
    ativoCirculanteRendaVar,
    ["ativo_circulante_renda_variavel"],
  )
  pushSubsection(
    "Cripto",
    totals.ativoCirculanteCriptoTotal,
    ativoCirculanteCripto,
    ["ativo_circulante_cripto"],
  )

  pushHeader("  Ativo Não Circulante")
  pushSubsection(
    "Recursos Bloqueados",
    totals.ativoNCBloqueadoTotal,
    ativoNCBloqueado,
    ["ativo_nc_bloqueado"],
    totals.ativoNCBloqueadoTotal > 0,
  )
  pushSubsection(
    "Imobilizado",
    totals.ativoNCImobilizadoTotal,
    undefined,
    ["ativo_nc_imobilizado"],
  )
  pushSubsection(
    "Intangível",
    totals.ativoNCIntangivelTotal,
    undefined,
    ["ativo_nc_intangivel"],
    totals.ativoNCIntangivelTotal !== 0 ||
      (adjustmentsBySection.get("ativo_nc_intangivel") ?? []).length > 0,
  )
  pushLine("TOTAL DO ATIVO", totals.ativoTotal)
  pushGap()

  // PASSIVO
  pushHeader("PASSIVO")
  pushHeader("  Passivo Circulante")
  pushSubsection(
    "Cartões de Crédito",
    passivoCartoes?.total ?? 0,
    passivoCartoes,
    ["passivo_circulante_cartoes"],
  )
  if (overdueLiabilities.length > 0) {
    pushLine("    Agendadas vencidas", totals.overdueLiabilitiesTotal)
    for (const l of [...overdueLiabilities].sort((a, b) => b.cents - a.cents)) {
      pushLine(
        `      ↳ ${l.label} · venc. ${l.dueDate.split("-").reverse().join("/")}`,
        l.cents,
      )
    }
  }
  if ((adjustmentsBySection.get("passivo_circulante_outros") ?? []).length > 0) {
    pushLine("    Outros", sumAdj("passivo_circulante_outros"))
    pushAdjLines("passivo_circulante_outros")
  }

  if (
    totals.passivoNCTotal !== 0 ||
    (adjustmentsBySection.get("passivo_nc_financiamentos") ?? []).length > 0
  ) {
    pushHeader("  Passivo Não Circulante")
    pushLine("    Financiamentos", totals.passivoNCTotal)
    pushAdjLines("passivo_nc_financiamentos")
  }
  pushLine("TOTAL DO PASSIVO", totals.passivoTotal)
  pushGap()

  pushLine("PATRIMÔNIO LÍQUIDO", totals.patrimonioLiquido)
  pushGap()
  pushLine("TOTAL PASSIVO + PL", totals.passivoTotal + totals.patrimonioLiquido)

  if (registries.length > 0) {
    pushGap()
    pushHeader("HISTÓRICO DE REGISTROS DO PERÍODO")
    rows.push(["Tipo", "Descrição", "Débito", "Crédito", "Valor", "Obs."])
    for (const r of registries) {
      rows.push([
        r.kind.replace(/_/g, " "),
        r.description,
        r.debit_label,
        r.credit_label,
        r.amount_cents / 100,
        r.note ?? "",
      ])
    }
  }

  return rows
}
