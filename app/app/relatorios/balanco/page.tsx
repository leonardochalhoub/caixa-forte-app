export const dynamic = "force-dynamic"
export const revalidate = 0

import { Scale } from "lucide-react"
import { requireOnboardedUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { formatBRL } from "@/lib/money"
import { PrintActions } from "../conciliacao/_components/PrintActions"
import { BalancoPeriodSelector } from "./_components/BalancoPeriodSelector"
import {
  AdjustmentActions,
  type Adjustment,
} from "./_components/AdjustmentForm"
import { BalancoAIInsight } from "./_components/BalancoAIInsight"
import { AddRegistryButton } from "./_components/RegistryForm"
import { type FipeMetadata } from "@/lib/fipe"
import { autoSyncFipeForPeriod } from "@/lib/reports/balanco-fipe-sync"
import { bankKeyOfCard, normalizeMerchant } from "@/lib/invoices/bucket"

import { MONTH_NAMES_PT } from "@/lib/time"
import {
  type AccountRow,
  type ClassificationKey,
  type SearchParams,
  type Tx,
  parsePeriod,
  SECTION_LABELS,
  TYPE_CLASSIFICATION,
} from "@/lib/reports/balanco"
import {
  AdjList,
  Bucket as BucketBlock,
  SectionHeader,
  SubSectionHeader,
} from "./_components/BalancoBlocks"

export default async function BalancoPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const user = await requireOnboardedUser()
  const supabase = await createServerClient()
  const sp = await searchParams

  const now = new Date()
  const defaultPeriod = `mensal:${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const periodStr = sp.periodo ?? defaultPeriod
  const period = parsePeriod(periodStr)
  const snapshotDate = period.snapshotDate
  const periodStart =
    period.kind === "anual"
      ? `${period.year}-01-01`
      : `${period.year}-${String(period.month).padStart(2, "0")}-01`

  const [
    { data: accounts },
    { data: txsRaw },
    { data: profileRaw },
    { data: adjustmentsRaw },
  ] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name, type, opening_balance_cents, balance_classification")
      .eq("user_id", user.id)
      .is("archived_at", null),
    // Sem filtro de occurred_on — dívida de cartão precisa de todas
    // as tx não pagas independente da data (source of truth alinhado
    // com /app/cartoes). Filtros por data acontecem no código que
    // de fato precisa deles (overdueLiabilities, FIPE, etc).
    supabase
      .from("transactions")
      .select(
        "id, account_id, type, amount_cents, occurred_on, paid_at, merchant, is_transfer",
      )
      .eq("user_id", user.id),
    supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("balance_adjustments")
      .select("id, period, line_key, label, amount_cents, note, metadata")
      .eq("user_id", user.id)
      .eq("period", periodStr),
  ])

  const { data: registriesRaw } = await supabase
    .from("balance_registries")
    .select(
      "id, period, kind, description, amount_cents, debit_section, debit_label, credit_section, credit_label, note, created_at",
    )
    .eq("user_id", user.id)
    .eq("period", periodStr)
    .order("created_at", { ascending: false })
  type RegistryRow = {
    id: string
    period: string
    kind: string
    description: string
    amount_cents: number
    debit_section: string
    debit_label: string
    credit_section: string
    credit_label: string
    note: string | null
    created_at: string
  }
  const registries = (registriesRaw ?? []) as RegistryRow[]

  type AdjRow = {
    id: string
    period: string
    line_key: string
    label: string
    amount_cents: number
    note: string | null
    metadata?: FipeMetadata | null
  }
  let adjustments = (adjustmentsRaw ?? []) as AdjRow[]

  // Auto-sync FIPE: ao abrir um período mensal, propaga ajustes FIPE
  // dos outros períodos pra esse, atualizando preço com cotação FIPE
  // quando possível. Lógica em lib/reports/balanco-fipe-sync.ts.
  if (period.kind === "mensal") {
    const newAdjs = await autoSyncFipeForPeriod(
      supabase,
      user.id,
      periodStr,
      adjustments,
    )
    if (newAdjs.length > 0) adjustments = [...adjustments, ...newAdjs]
  }
  const adjustmentsBySection = new Map<string, Adjustment[]>()
  for (const a of adjustments) {
    const [section] = a.line_key.split("::")
    if (!section) continue
    const list = adjustmentsBySection.get(section) ?? []
    const readonlySource =
      (a.metadata as FipeMetadata | null)?.source === "fipe"
        ? ("fipe" as const)
        : null
    list.push({
      id: a.id,
      label: a.label,
      amount_cents: a.amount_cents,
      note: a.note,
      readonly_source: readonlySource,
    })
    adjustmentsBySection.set(section, list)
  }
  const sumAdj = (section: string) =>
    (adjustmentsBySection.get(section) ?? []).reduce(
      (s, a) => s + a.amount_cents,
      0,
    )

  const accs = (accounts ?? []) as AccountRow[]
  const txs = (txsRaw ?? []) as Tx[]

  // Helpers de string-match — aliases dos canônicos de @/lib/invoices/bucket.
  const normalizeStr = normalizeMerchant
  const bankKeyOf = bankKeyOfCard

  // Saldo por conta na data do snapshot.
  // Não-cartão: só paid_at !== null e paid_at <= snapshot (caixa real).
  // Cartão: faturas do PERÍODO selecionado, ainda não pagas até o snapshot.
  //   - Mensal Abril → só fatura(s) com occurred_on em 2026-04
  //   - Anual 2026   → faturas com occurred_on em 2026-* ainda abertas em 31/12
  // Mesma lógica do /app/cartoes (agrupamento por YYYY-MM).
  const periodPrefix =
    period.kind === "mensal"
      ? `${period.year}-${String(period.month).padStart(2, "0")}`
      : `${period.year}`
  const inPeriod = (ymd: string): boolean => ymd.startsWith(periodPrefix)
  const isPaidBySnapshot = (t: { paid_at: string | null }): boolean =>
    !!t.paid_at && t.paid_at <= `${snapshotDate}T23:59:59Z`

  function balanceAt(acc: AccountRow, cutoffIso: string): number {
    const opening = Number(acc.opening_balance_cents ?? 0)
    const isCredit = acc.type === "credit"
    const mine = txs.filter((t) => t.account_id === acc.id)
    let flow = 0

    if (!isCredit) {
      for (const t of mine) {
        if (t.occurred_on > cutoffIso) continue
        if (!t.paid_at) continue
        if (t.paid_at > `${cutoffIso}T23:59:59Z`) continue
        flow +=
          t.type === "income"
            ? Number(t.amount_cents)
            : -Number(t.amount_cents)
      }
      return opening + flow
    }

    // Cartão: soma só faturas do período selecionado ainda abertas no snapshot
    for (const t of mine) {
      if (!inPeriod(t.occurred_on)) continue
      if (isPaidBySnapshot(t)) continue
      flow +=
        t.type === "income" ? Number(t.amount_cents) : -Number(t.amount_cents)
    }
    const bankKey = bankKeyOf(acc.name)
    if (bankKey) {
      for (const t of txs) {
        if (t.account_id === acc.id) continue
        if (t.is_transfer) continue
        if (t.type !== "expense") continue
        if (!inPeriod(t.occurred_on)) continue
        if (isPaidBySnapshot(t)) continue
        const m = normalizeStr(t.merchant ?? "")
        if (!m.includes("cartao")) continue
        if (!m.includes(bankKey)) continue
        flow -= Number(t.amount_cents)
      }
    }
    return flow
  }

  type Line = {
    accountId: string
    accountName: string
    cents: number
  }
  type Bucket = {
    key: ClassificationKey
    label: string
    lines: Line[]
    total: number
  }

  const buckets = new Map<ClassificationKey, Bucket>()
  for (const a of accs) {
    const defaultKey =
      TYPE_CLASSIFICATION[a.type as keyof typeof TYPE_CLASSIFICATION]
    if (!defaultKey) continue
    // Override do user: se marcou nao_circulante e default é Ativo
    // Circulante, move pro bucket "imobilizado" (mais próximo de
    // "NC genérico"). Se marcou circulante mas default é NC (ex:
    // FGTS), move pra Disponibilidades.
    let key: ClassificationKey = defaultKey
    if (a.balance_classification === "nao_circulante") {
      if (defaultKey.startsWith("ativo_circulante")) {
        // vai pra "ativo_nc_investimentos_outros" subseção — mas
        // preciso garantir que essa key é Classification válida.
        // Simplificação: trata como bloqueado se fgts-like, senão
        // cria bucket dinâmico. Por enquanto, marca via section key
        // que já existe.
        key = "ativo_nc_bloqueado"
      }
    } else if (a.balance_classification === "circulante") {
      if (defaultKey === "ativo_nc_bloqueado") {
        key = "ativo_circulante_disponivel"
      }
    }
    const cents = balanceAt(a, snapshotDate)
    const b = buckets.get(key) ?? {
      key,
      label: SECTION_LABELS[key],
      lines: [],
      total: 0,
    }
    b.lines.push({
      accountId: a.id,
      accountName: a.name,
      cents: key.startsWith("passivo") ? Math.abs(cents) : cents,
    })
    b.total += key.startsWith("passivo") ? Math.abs(cents) : cents
    buckets.set(key, b)
  }

  // Monta estrutura do Balanço brasileiro
  const ativoCirculanteDisponivel = buckets.get("ativo_circulante_disponivel")
  const ativoCirculanteRendaFixa = buckets.get("ativo_circulante_renda_fixa")
  const ativoCirculanteRendaVar = buckets.get("ativo_circulante_renda_variavel")
  const ativoCirculanteCripto = buckets.get("ativo_circulante_cripto")
  const ativoNCBloqueado = buckets.get("ativo_nc_bloqueado")
  const passivoCartoes = buckets.get("passivo_circulante_cartoes")

  const ativoCirculanteDisponivelTotal =
    (ativoCirculanteDisponivel?.total ?? 0) +
    sumAdj("ativo_circulante_disponivel") +
    sumAdj("ativo_circulante_outros")
  const ativoCirculanteRendaFixaTotal =
    (ativoCirculanteRendaFixa?.total ?? 0) +
    sumAdj("ativo_circulante_renda_fixa")
  const ativoCirculanteRendaVarTotal =
    (ativoCirculanteRendaVar?.total ?? 0) +
    sumAdj("ativo_circulante_renda_variavel")
  const ativoCirculanteCriptoTotal =
    (ativoCirculanteCripto?.total ?? 0) +
    sumAdj("ativo_circulante_cripto")
  const ativoCirculanteTotal =
    ativoCirculanteDisponivelTotal +
    ativoCirculanteRendaFixaTotal +
    ativoCirculanteRendaVarTotal +
    ativoCirculanteCriptoTotal
  const ativoNCBloqueadoTotal =
    (ativoNCBloqueado?.total ?? 0) + sumAdj("ativo_nc_bloqueado")
  const ativoNCImobilizadoTotal = sumAdj("ativo_nc_imobilizado")
  const ativoNCIntangivelTotal = sumAdj("ativo_nc_intangivel")
  const ativoNCTotal =
    ativoNCBloqueadoTotal +
    ativoNCImobilizadoTotal +
    ativoNCIntangivelTotal
  const ativoTotal = ativoCirculanteTotal + ativoNCTotal

  // Agendadas vencidas (non-cartão, não pagas, occurred_on já
  // passou) entram como Passivo Circulante — são dívidas de curto
  // prazo, obrigações assumidas cujo serviço/bem já foi prestado.
  // Cartão já é tratado no bucket dedicado.
  type OverdueLine = {
    id: string
    label: string
    dueDate: string
    cents: number
  }
  const creditIds = new Set(
    accs.filter((a) => a.type === "credit").map((a) => a.id),
  )
  const overdueLiabilities: OverdueLine[] = []
  for (const t of txs) {
    if (t.is_transfer) continue
    if (t.type !== "expense") continue
    if (t.paid_at) continue
    if (t.occurred_on > snapshotDate) continue
    if (creditIds.has(t.account_id)) continue // cartão já tem seu bucket
    // Ignora se merchant já é lump-sum de cartão (já detectado lá)
    const m = normalizeStr(t.merchant ?? "")
    if (m.includes("cartao")) continue
    overdueLiabilities.push({
      id: t.id,
      label: t.merchant ?? "Despesa vencida",
      dueDate: t.occurred_on,
      cents: Number(t.amount_cents),
    })
  }
  const overdueLiabilitiesTotal = overdueLiabilities.reduce(
    (s, l) => s + l.cents,
    0,
  )

  const passivoCirculanteTotal =
    (passivoCartoes?.total ?? 0) +
    sumAdj("passivo_circulante_cartoes") +
    sumAdj("passivo_circulante_outros") +
    overdueLiabilitiesTotal
  const passivoNCTotal = sumAdj("passivo_nc_financiamentos")
  const passivoTotal = passivoCirculanteTotal + passivoNCTotal

  // Patrimônio líquido = Ativo - Passivo (equação fundamental do BP)
  const patrimonioLiquido = ativoTotal - passivoTotal
  const balanced = ativoTotal === passivoTotal + patrimonioLiquido

  // Snapshot compacto pra IA — valores em reais (não centavos) pra
  // ficar legível no prompt sem a IA precisar dividir.
  const toReais = (c: number) => Math.round(c) / 100
  const bucketToAi = (b?: {
    lines: { accountName: string; cents: number }[]
  }) =>
    (b?.lines ?? []).map((l) => ({
      nome: l.accountName,
      valor: toReais(l.cents),
    }))
  const adjsToAi = (section: string) =>
    (adjustmentsBySection.get(section) ?? []).map((a) => ({
      descricao: a.label,
      valor: toReais(a.amount_cents),
    }))
  const aiSnapshot = {
    periodo: period.label,
    data_posicao: snapshotDate,
    ativo: {
      total: toReais(ativoTotal),
      circulante: {
        total: toReais(ativoCirculanteTotal),
        disponibilidades: {
          total: toReais(ativoCirculanteDisponivelTotal),
          contas: bucketToAi(ativoCirculanteDisponivel),
          ajustes: [
            ...adjsToAi("ativo_circulante_disponivel"),
            ...adjsToAi("ativo_circulante_outros"),
          ],
        },
        renda_fixa: {
          total: toReais(ativoCirculanteRendaFixaTotal),
          contas: bucketToAi(ativoCirculanteRendaFixa),
          ajustes: adjsToAi("ativo_circulante_renda_fixa"),
        },
        renda_variavel: {
          total: toReais(ativoCirculanteRendaVarTotal),
          contas: bucketToAi(ativoCirculanteRendaVar),
          ajustes: adjsToAi("ativo_circulante_renda_variavel"),
        },
        cripto: {
          total: toReais(ativoCirculanteCriptoTotal),
          contas: bucketToAi(ativoCirculanteCripto),
          ajustes: adjsToAi("ativo_circulante_cripto"),
        },
      },
      nao_circulante: {
        total: toReais(ativoNCTotal),
        bloqueado_fgts: {
          total: toReais(ativoNCBloqueadoTotal),
          contas: bucketToAi(ativoNCBloqueado),
        },
        imobilizado: {
          total: toReais(ativoNCImobilizadoTotal),
          itens: adjsToAi("ativo_nc_imobilizado"),
        },
        intangivel: {
          total: toReais(ativoNCIntangivelTotal),
          itens: adjsToAi("ativo_nc_intangivel"),
        },
      },
    },
    passivo: {
      total: toReais(passivoTotal),
      circulante: {
        total: toReais(passivoCirculanteTotal),
        cartoes: {
          total: toReais(passivoCartoes?.total ?? 0),
          faturas: bucketToAi(passivoCartoes),
        },
        agendadas_vencidas: overdueLiabilities.map((l) => ({
          descricao: l.label,
          vencimento: l.dueDate,
          valor: toReais(l.cents),
        })),
        outros: adjsToAi("passivo_circulante_outros"),
      },
      nao_circulante: {
        total: toReais(passivoNCTotal),
        financiamentos: adjsToAi("passivo_nc_financiamentos"),
      },
    },
    patrimonio_liquido: toReais(patrimonioLiquido),
  }

  const displayName =
    (profileRaw as { display_name?: string | null } | null)?.display_name ??
    (user.user_metadata as { display_name?: string; full_name?: string } | null)
      ?.display_name ??
    user.email ??
    ""
  const generatedAt = new Date().toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  })

  // Períodos disponíveis = meses/anos com tx REAL (não transfer,
  // senão "Saldo inicial" inflava meses vazios) + ajustes + mês atual.
  const activeMonths = new Set<string>()
  const activeYears = new Set<number>()
  for (const t of txs) {
    if (t.is_transfer) continue
    activeMonths.add(t.occurred_on.slice(0, 7))
    activeYears.add(Number(t.occurred_on.slice(0, 4)))
  }
  for (const a of adjustments) {
    if (a.period.startsWith("mensal:")) {
      const ym = a.period.slice(7)
      activeMonths.add(ym)
      activeYears.add(Number(ym.slice(0, 4)))
    } else if (a.period.startsWith("anual:")) {
      activeYears.add(Number(a.period.slice(6)))
    }
  }
  const today = new Date()
  const currentYm = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`
  activeMonths.add(currentYm)
  activeYears.add(today.getFullYear())

  const periodOptions = [...activeMonths]
    .sort()
    .reverse()
    .map((ym) => {
      const [yStr, mStr] = ym.split("-")
      const y = Number(yStr)
      const m = Number(mStr)
      return {
        value: `mensal:${ym}`,
        label: `${MONTH_NAMES_PT[m - 1]} ${y}`,
      }
    })
  const yearOptions = [...activeYears]
    .sort((a, b) => b - a)
    .map((y) => ({ value: `anual:${y}`, label: `Ano ${y}` }))

  const xlsxRows: (string | number)[][] = []
  const pushLine = (label: string, value: number) =>
    xlsxRows.push([label, value / 100])
  const pushHeader = (label: string) => xlsxRows.push([label])
  const pushGap = () => xlsxRows.push([])
  const pushBucketLines = (bucket?: { lines: { accountName: string; cents: number }[] }) => {
    for (const l of bucket?.lines ?? []) pushLine(`      ↳ ${l.accountName}`, l.cents)
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

  xlsxRows.push(["Balanço Contábil", period.label, "", "Snapshot", snapshotDate])
  pushGap()

  // ATIVO
  pushHeader("ATIVO")
  pushHeader("  Ativo Circulante")
  pushSubsection(
    "Disponibilidades",
    ativoCirculanteDisponivelTotal,
    ativoCirculanteDisponivel,
    ["ativo_circulante_disponivel", "ativo_circulante_outros"],
  )
  pushSubsection(
    "Aplicações de Renda Fixa",
    ativoCirculanteRendaFixaTotal,
    ativoCirculanteRendaFixa,
    ["ativo_circulante_renda_fixa"],
  )
  pushSubsection(
    "Renda Variável",
    ativoCirculanteRendaVarTotal,
    ativoCirculanteRendaVar,
    ["ativo_circulante_renda_variavel"],
  )
  pushSubsection(
    "Cripto",
    ativoCirculanteCriptoTotal,
    ativoCirculanteCripto,
    ["ativo_circulante_cripto"],
  )

  pushHeader("  Ativo Não Circulante")
  pushSubsection(
    "Recursos Bloqueados",
    ativoNCBloqueadoTotal,
    ativoNCBloqueado,
    ["ativo_nc_bloqueado"],
    ativoNCBloqueadoTotal > 0,
  )
  pushSubsection(
    "Imobilizado",
    ativoNCImobilizadoTotal,
    undefined,
    ["ativo_nc_imobilizado"],
  )
  pushSubsection(
    "Intangível",
    ativoNCIntangivelTotal,
    undefined,
    ["ativo_nc_intangivel"],
    ativoNCIntangivelTotal !== 0 ||
      (adjustmentsBySection.get("ativo_nc_intangivel") ?? []).length > 0,
  )
  pushLine("TOTAL DO ATIVO", ativoTotal)
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
    pushLine("    Agendadas vencidas", overdueLiabilitiesTotal)
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
    passivoNCTotal !== 0 ||
    (adjustmentsBySection.get("passivo_nc_financiamentos") ?? []).length > 0
  ) {
    pushHeader("  Passivo Não Circulante")
    pushLine("    Financiamentos", passivoNCTotal)
    pushAdjLines("passivo_nc_financiamentos")
  }
  pushLine("TOTAL DO PASSIVO", passivoTotal)
  pushGap()

  pushLine("PATRIMÔNIO LÍQUIDO", patrimonioLiquido)
  pushGap()
  pushLine("TOTAL PASSIVO + PL", passivoTotal + patrimonioLiquido)

  if (registries.length > 0) {
    pushGap()
    pushHeader("HISTÓRICO DE REGISTROS DO PERÍODO")
    xlsxRows.push(["Tipo", "Descrição", "Débito", "Crédito", "Valor", "Obs."])
    for (const r of registries) {
      xlsxRows.push([
        r.kind.replace(/_/g, " "),
        r.description,
        r.debit_label,
        r.credit_label,
        r.amount_cents / 100,
        r.note ?? "",
      ])
    }
  }

  return (
    <article className="report-root space-y-8">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <BalancoPeriodSelector
          current={periodStr}
          months={periodOptions}
          years={yearOptions}
        />
        <div className="flex items-center gap-2">
          <AddRegistryButton period={periodStr} />
          <PrintActions
            rows={xlsxRows}
            filename={`balanco-${periodStr.replace(":", "-")}.xlsx`}
            sheetName={period.label}
          />
        </div>
      </div>

      <header className="space-y-1 border-b border-border pb-4">
        <p className="text-xs uppercase tracking-[0.22em] text-muted">
          Balanço Contábil
        </p>
        <h1 className="flex items-center gap-2 font-serif text-3xl text-strong">
          <Scale className="h-6 w-6" />
          {period.label}
        </h1>
        <p className="text-xs text-muted">
          Posição em {snapshotDate.split("-").reverse().join("/")} · Gerado em{" "}
          {generatedAt} · {displayName}
        </p>
      </header>

      <div className="balanco-grid grid gap-6 lg:grid-cols-2">
        {/* ATIVO */}
        <section className="avoid-break space-y-3 rounded-2xl border-2 border-border p-5">
          <h2 className="font-serif text-xl text-strong">ATIVO</h2>

          <div className="space-y-2">
            <SectionHeader
              title="Ativo Circulante"
              total={ativoCirculanteTotal}
            />
            <div className="pl-2">
              <SubSectionHeader
                title="Disponibilidades"
                total={ativoCirculanteDisponivelTotal}
              />
              <BucketBlock bucket={ativoCirculanteDisponivel} />
              <AdjList
                items={
                  adjustmentsBySection.get("ativo_circulante_disponivel") ?? []
                }
              />
              <AdjList
                items={
                  adjustmentsBySection.get("ativo_circulante_outros") ?? []
                }
                hint="Outros circulantes"
              />
            </div>
            <div className="pl-2">
              <SubSectionHeader
                title="Aplicações de Renda Fixa"
                total={ativoCirculanteRendaFixaTotal}
              />
              <BucketBlock bucket={ativoCirculanteRendaFixa} />
              <AdjList
                items={
                  adjustmentsBySection.get("ativo_circulante_renda_fixa") ?? []
                }
              />
            </div>
            <div className="pl-2">
              <SubSectionHeader
                title="Renda Variável"
                total={ativoCirculanteRendaVarTotal}
              />
              <BucketBlock bucket={ativoCirculanteRendaVar} />
              <AdjList
                items={
                  adjustmentsBySection.get("ativo_circulante_renda_variavel") ?? []
                }
              />
            </div>
            <div className="pl-2">
              <SubSectionHeader
                title="Cripto"
                total={ativoCirculanteCriptoTotal}
              />
              <BucketBlock bucket={ativoCirculanteCripto} />
              <AdjList
                items={adjustmentsBySection.get("ativo_circulante_cripto") ?? []}
              />
            </div>
          </div>

          <div className="space-y-2 pt-3">
            <SectionHeader title="Ativo Não Circulante" total={ativoNCTotal} />
            {ativoNCBloqueadoTotal > 0 && (
              <div className="pl-2">
                <SubSectionHeader
                  title="Recursos Bloqueados"
                  total={ativoNCBloqueadoTotal}
                />
                <BucketBlock bucket={ativoNCBloqueado} />
                <AdjList
                  items={adjustmentsBySection.get("ativo_nc_bloqueado") ?? []}
                />
              </div>
            )}
            <div className="pl-2">
              <SubSectionHeader
                title="Imobilizado"
                total={ativoNCImobilizadoTotal}
              />
              <AdjList
                items={adjustmentsBySection.get("ativo_nc_imobilizado") ?? []}
              />
            </div>
            {(ativoNCIntangivelTotal !== 0 ||
              (adjustmentsBySection.get("ativo_nc_intangivel") ?? []).length >
                0) && (
              <div className="pl-2">
                <SubSectionHeader
                  title="Intangível"
                  total={ativoNCIntangivelTotal}
                />
                <AdjList
                  items={adjustmentsBySection.get("ativo_nc_intangivel") ?? []}
                />
              </div>
            )}
          </div>

          <div className="flex items-baseline justify-between border-t-2 border-border pt-3">
            <span className="text-sm font-semibold uppercase tracking-wider text-strong">
              Total do Ativo
            </span>
            <span className="font-mono text-xl font-bold tabular-nums text-strong">
              {formatBRL(ativoTotal)}
            </span>
          </div>
        </section>

        {/* PASSIVO + PL */}
        <section className="avoid-break space-y-3 rounded-2xl border-2 border-border p-5">
          <h2 className="font-serif text-xl text-strong">PASSIVO + PL</h2>

          <div className="space-y-2">
            <SectionHeader
              title="Passivo Circulante"
              total={passivoCirculanteTotal}
            />
            <div className="pl-2">
              <SubSectionHeader
                title="Cartões de Crédito"
                total={passivoCartoes?.total ?? 0}
              />
              <BucketBlock bucket={passivoCartoes} />
              <AdjList
                items={
                  adjustmentsBySection.get("passivo_circulante_cartoes") ?? []
                }
              />
            </div>
            {overdueLiabilities.length > 0 && (
              <div className="pl-2">
                <SubSectionHeader
                  title="Agendadas vencidas"
                  total={overdueLiabilitiesTotal}
                />
                <ul className="space-y-0.5 pl-7">
                  {overdueLiabilities
                    .sort((a, b) => b.cents - a.cents)
                    .map((l) => (
                      <li
                        key={l.id}
                        className="flex items-baseline justify-between gap-3 text-[11px] text-muted"
                      >
                        <span className="min-w-0 flex-1 truncate">
                          ↳ {l.label}{" "}
                          <span className="text-[9px]">
                            · venc. {l.dueDate.split("-").reverse().join("/")}
                          </span>
                        </span>
                        <span className="shrink-0 font-mono tabular-nums">
                          {formatBRL(l.cents)}
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            )}
            {(adjustmentsBySection.get("passivo_circulante_outros") ?? [])
              .length > 0 && (
              <div className="pl-2">
                <SubSectionHeader
                  title="Outros"
                  total={sumAdj("passivo_circulante_outros")}
                />
                <AdjList
                  items={
                    adjustmentsBySection.get("passivo_circulante_outros") ?? []
                  }
                />
              </div>
            )}
          </div>

          <div className="space-y-2 pt-3">
            <SectionHeader
              title="Passivo Não Circulante"
              total={passivoNCTotal}
            />
            {(adjustmentsBySection.get("passivo_nc_financiamentos") ?? [])
              .length > 0 && (
              <div className="pl-2">
                <SubSectionHeader
                  title="Financiamentos"
                  total={sumAdj("passivo_nc_financiamentos")}
                />
                <AdjList
                  items={
                    adjustmentsBySection.get("passivo_nc_financiamentos") ?? []
                  }
                />
              </div>
            )}
          </div>

          <div className="flex items-baseline justify-between border-t border-border pt-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-strong">
              Total do Passivo
            </span>
            <span className="font-mono text-base font-bold tabular-nums text-strong">
              {formatBRL(passivoTotal)}
            </span>
          </div>

          <div className="space-y-2 pt-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold uppercase tracking-wider text-strong">
                Patrimônio Líquido
              </span>
              <span
                className={`font-mono text-lg font-bold tabular-nums ${
                  patrimonioLiquido >= 0 ? "text-income" : "text-expense"
                }`}
              >
                {formatBRL(patrimonioLiquido)}
              </span>
            </div>
            <p className="text-[10px] italic text-muted">
              = Ativo − Passivo ({formatBRL(ativoTotal)} −{" "}
              {formatBRL(passivoTotal)})
            </p>
          </div>

          <div className="flex items-baseline justify-between border-t-2 border-border pt-3">
            <span className="text-sm font-semibold uppercase tracking-wider text-strong">
              Total Passivo + PL
            </span>
            <span className="font-mono text-xl font-bold tabular-nums text-strong">
              {formatBRL(passivoTotal + patrimonioLiquido)}
            </span>
          </div>
        </section>
      </div>

      <section className="avoid-break space-y-2 rounded-xl border border-dashed border-border bg-subtle p-4">
        <h2 className="text-sm font-medium uppercase tracking-wider text-strong">
          Equação fundamental
        </h2>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 font-serif text-sm text-body">
          <span>Ativo</span>
          <span className="font-mono font-semibold text-strong">
            {formatBRL(ativoTotal)}
          </span>
          <span className="text-muted">=</span>
          <span>Passivo</span>
          <span className="font-mono font-semibold text-strong">
            {formatBRL(passivoTotal)}
          </span>
          <span className="text-muted">+</span>
          <span>Patrimônio Líquido</span>
          <span
            className={`font-mono font-semibold ${
              patrimonioLiquido >= 0 ? "text-income" : "text-expense"
            }`}
          >
            {formatBRL(patrimonioLiquido)}
          </span>
          <span className={balanced ? "text-income" : "text-expense"}>
            {balanced ? "✓ balanceado" : "✗ desbalanceado"}
          </span>
        </div>
        <p className="text-[11px] italic text-muted">
          Contabilidade ≠ Fluxo de Caixa. O Balanço é um retrato em uma data
          específica (posição patrimonial); o fluxo de caixa é filme (movimento
          no período). Ambos convergem no final — se o usuário tem X de caixa
          no Balanço de abril, o fluxo mostra como chegou até X.
        </p>
      </section>

      <div className="no-print">
        <BalancoAIInsight snapshot={aiSnapshot} />
      </div>

      {registries.length > 0 && (
        <section className="avoid-break space-y-2 rounded-xl border border-border p-4">
          <h2 className="text-sm font-medium uppercase tracking-wider text-strong">
            Histórico de registros do período
          </h2>
          <ul className="space-y-1.5">
            {registries.map((r) => (
              <li
                key={r.id}
                className="flex items-start justify-between gap-3 border-b border-border/50 pb-1.5 text-xs last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-strong">
                    {r.description}{" "}
                    <span className="text-[10px] uppercase tracking-wider text-muted">
                      · {r.kind.replace(/_/g, " ")}
                    </span>
                  </p>
                  <p className="text-[11px] text-muted">
                    <span className="text-income">D</span> {r.debit_label} →{" "}
                    <span className="text-expense">C</span> {r.credit_label}
                    {r.note && ` · ${r.note}`}
                  </p>
                </div>
                <span className="font-mono tabular-nums text-body">
                  {formatBRL(r.amount_cents)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="border-t border-border pt-4 text-[10px] text-muted">
        Caixa Forte · balanço contábil · Modelo brasileiro (CPC/Lei 6.404
        adaptado). Classificação automática por tipo de conta. Para ajustes
        manuais (linhas custom, reavaliações), aplique a migration 0027 e
        use o formulário de edição.
      </footer>
    </article>
  )
}

