export const dynamic = "force-dynamic"
export const revalidate = 0

import { Scale } from "lucide-react"
import { requireOnboardedUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { untyped } from "@/lib/supabase/untyped"
import { formatBRL } from "@/lib/money"
import { PrintActions } from "../conciliacao/_components/PrintActions"
import { BalancoPeriodSelector } from "./_components/BalancoPeriodSelector"
import {
  AdjustmentActions,
  type Adjustment,
} from "./_components/AdjustmentForm"
import { AddRegistryButton } from "./_components/RegistryForm"
import { fetchFipePrice, type FipeMetadata } from "@/lib/fipe"

const MONTH_NAMES_PT = [
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
]

type Tx = {
  id: string
  account_id: string
  type: "income" | "expense"
  amount_cents: number
  occurred_on: string
  paid_at: string | null
  merchant: string | null
  is_transfer: boolean | null
}

type AccountRow = {
  id: string
  name: string
  type: string
  opening_balance_cents: number | null
  balance_classification?: "circulante" | "nao_circulante" | null
}

interface SearchParams {
  periodo?: string
}

// "mensal:2026-04" | "anual:2026"
// snapshotDate é o MIN entre (último dia do período) e (hoje) — se
// estamos dentro do período em questão, tira retrato no dia de hoje;
// se o período já acabou, usa o fim dele; se o período é futuro, usa
// o fim dele também (projeção, edge case raro).
function parsePeriod(p: string): {
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

const TYPE_CLASSIFICATION = {
  checking: "ativo_circulante_disponivel",
  cash: "ativo_circulante_disponivel",
  wallet: "ativo_circulante_disponivel",
  // Todas aplicações financeiras (renda fixa, renda variável, cripto)
  // entram em Ativo Circulante. Pra pessoa física no BR, essas são
  // líquidas o suficiente: poupança/CDB D+0, ações D+2, cripto 24/7.
  savings: "ativo_circulante_renda_fixa",
  poupanca: "ativo_circulante_renda_fixa",
  investment: "ativo_circulante_renda_variavel",
  crypto: "ativo_circulante_cripto",
  fgts: "ativo_nc_bloqueado",
  credit: "passivo_circulante_cartoes",
} as const

type ClassificationKey = (typeof TYPE_CLASSIFICATION)[keyof typeof TYPE_CLASSIFICATION]

const SECTION_LABELS: Record<ClassificationKey, string> = {
  ativo_circulante_disponivel: "Disponibilidades",
  ativo_circulante_renda_fixa: "Renda Fixa",
  ativo_circulante_renda_variavel: "Renda Variável",
  ativo_circulante_cripto: "Cripto",
  ativo_nc_bloqueado: "Bloqueado (FGTS)",
  passivo_circulante_cartoes: "Cartões de Crédito",
}

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
    untyped(supabase)
      .from("accounts")
      .select("id, name, type, opening_balance_cents, balance_classification")
      .eq("user_id", user.id)
      .is("archived_at", null),
    untyped(supabase)
      .from("transactions")
      .select(
        "id, account_id, type, amount_cents, occurred_on, paid_at, merchant, is_transfer",
      )
      .eq("user_id", user.id)
      .lte("occurred_on", snapshotDate),
    untyped(supabase)
      .from("profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .maybeSingle(),
    untyped(supabase)
      .from("balance_adjustments")
      .select("id, period, line_key, label, amount_cents, note, metadata")
      .eq("user_id", user.id)
      .eq("period", periodStr),
  ])

  const { data: registriesRaw } = await untyped(supabase)
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

  // Auto-sync FIPE: se existem ajustes FIPE em outros períodos mas não
  // no período corrente selecionado, busca o preço atual e cria entry
  // pra este período. Idempotente: se já tem, não duplica.
  if (period.kind === "mensal") {
    const { data: allFipeRaw } = await untyped(supabase)
      .from("balance_adjustments")
      .select("id, period, line_key, label, amount_cents, metadata")
      .eq("user_id", user.id)
      .eq("metadata->>source", "fipe")
    type FipeAdj = {
      id: string
      period: string
      line_key: string
      label: string
      amount_cents: number
      metadata: FipeMetadata
    }
    const allFipe = (allFipeRaw ?? []) as FipeAdj[]
    // Pra cada (fipe_code, year_id), verifica se existe entrada no periodStr
    const existingInPeriod = new Set(
      adjustments
        .map((a) => {
          const m = a.metadata as FipeMetadata | null
          return m?.source === "fipe" ? `${m.fipe_code}::${m.year_id}` : null
        })
        .filter((x): x is string => x != null),
    )
    const templatesByKey = new Map<string, FipeAdj>()
    for (const a of allFipe) {
      const k = `${a.metadata.fipe_code}::${a.metadata.year_id}`
      if (existingInPeriod.has(k)) continue
      const prev = templatesByKey.get(k)
      if (!prev || a.period > prev.period) templatesByKey.set(k, a)
    }
    // Busca preços em paralelo e faz insert
    const newInserts: Array<{
      user_id: string
      period: string
      line_key: string
      label: string
      amount_cents: number
      note: string
      metadata: FipeMetadata
    }> = []
    await Promise.all(
      [...templatesByKey.values()].map(async (t) => {
        const [section] = t.line_key.split("::")
        let priceCents = t.amount_cents
        let note = `Valor herdado do último período (${t.period.replace("mensal:", "")}) — FIPE indisponível ou sem dados pro mês.`
        let refMonth = t.metadata.last_reference_month
        try {
          const price = await fetchFipePrice(t.metadata)
          priceCents = price.priceCents
          note = `FIPE ${price.referenceMonth} · código ${t.metadata.fipe_code} · auto-atualizado ao abrir o período`
          refMonth = price.referenceMonth
        } catch {
          // Fallback: mantém valor do último período conhecido
        }
        newInserts.push({
          user_id: user.id,
          period: periodStr,
          line_key: `${section}::custom:${Date.now()}:fipe-${t.metadata.fipe_code}`,
          label: t.label,
          amount_cents: priceCents,
          note,
          metadata: {
            ...t.metadata,
            last_checked_at: new Date().toISOString(),
            last_reference_month: refMonth,
          },
        })
      }),
    )
    if (newInserts.length > 0) {
      const { data: inserted } = await untyped(supabase)
        .from("balance_adjustments")
        .insert(newInserts)
        .select("id, period, line_key, label, amount_cents, note")
      if (inserted) {
        for (const a of inserted as AdjRow[]) {
          adjustments = [...adjustments, a]
        }
      }
    }
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

  const normalizeStr = (s: string) =>
    s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
  const bankKeyOf = (name: string): string => {
    const cleaned = name.replace(/cart[ãa]o.*/i, "").trim()
    return normalizeStr(cleaned.split(/\s+/)[0] ?? "")
  }

  // Saldo por conta na data do snapshot.
  // Regra: não-cartão conta só paid_at !== null e paid_at <= snapshot.
  // Cartão conta TODAS as tx até a data (charges = dívida desde o swipe)
  // + lump-sums detectados em outras contas (merchant "<banco> cartão"
  // agendado) até a data.
  function balanceAt(acc: AccountRow, cutoffIso: string): number {
    const opening = Number(acc.opening_balance_cents ?? 0)
    const isCredit = acc.type === "credit"
    const mine = txs.filter((t) => t.account_id === acc.id)
    let flow = 0
    for (const t of mine) {
      if (t.occurred_on > cutoffIso) continue
      if (!isCredit) {
        if (!t.paid_at) continue
        if (t.paid_at > `${cutoffIso}T23:59:59Z`) continue
      }
      flow +=
        t.type === "income" ? Number(t.amount_cents) : -Number(t.amount_cents)
    }
    if (isCredit) {
      const bankKey = bankKeyOf(acc.name)
      if (bankKey) {
        for (const t of txs) {
          if (t.account_id === acc.id) continue
          if (t.is_transfer) continue
          if (t.type !== "expense") continue
          if (t.paid_at) continue // já pago, não é dívida na data
          if (t.occurred_on > cutoffIso) continue
          const m = normalizeStr(t.merchant ?? "")
          if (!m.includes("cartao")) continue
          if (!m.includes(bankKey)) continue
          flow -= Number(t.amount_cents) // aumenta dívida
        }
      }
    }
    return opening + flow
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

  const xlsxRows: (string | number)[][] = [
    ["Balanço Contábil", period.label, "", "Snapshot", snapshotDate],
    [],
    ["ATIVO"],
    ["  Ativo Circulante"],
    ["    Disponibilidades", (ativoCirculanteDisponivel?.total ?? 0) / 100],
    ...(ativoCirculanteDisponivel?.lines.map((l) => [
      `      ${l.accountName}`,
      l.cents / 100,
    ]) ?? []),
    ["  Ativo Não Circulante"],
    ["    Renda Fixa", (ativoCirculanteRendaFixa?.total ?? 0) / 100],
    ...(ativoCirculanteRendaFixa?.lines.map((l) => [
      `      ${l.accountName}`,
      l.cents / 100,
    ]) ?? []),
    ["    Renda Variável", (ativoCirculanteRendaVar?.total ?? 0) / 100],
    ...(ativoCirculanteRendaVar?.lines.map((l) => [
      `      ${l.accountName}`,
      l.cents / 100,
    ]) ?? []),
    ["    Cripto", (ativoCirculanteCripto?.total ?? 0) / 100],
    ...(ativoCirculanteCripto?.lines.map((l) => [
      `      ${l.accountName}`,
      l.cents / 100,
    ]) ?? []),
    ["    Bloqueado (FGTS)", (ativoNCBloqueado?.total ?? 0) / 100],
    ...(ativoNCBloqueado?.lines.map((l) => [
      `      ${l.accountName}`,
      l.cents / 100,
    ]) ?? []),
    ["TOTAL DO ATIVO", ativoTotal / 100],
    [],
    ["PASSIVO"],
    ["  Passivo Circulante"],
    ["    Cartões de Crédito", (passivoCartoes?.total ?? 0) / 100],
    ...(passivoCartoes?.lines.map((l) => [
      `      ${l.accountName}`,
      l.cents / 100,
    ]) ?? []),
    ["TOTAL DO PASSIVO", passivoTotal / 100],
    [],
    ["PATRIMÔNIO LÍQUIDO", patrimonioLiquido / 100],
    [],
    ["TOTAL PASSIVO + PL", (passivoTotal + patrimonioLiquido) / 100],
  ]

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
              <Bucket bucket={ativoCirculanteDisponivel} />
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
              <Bucket bucket={ativoCirculanteRendaFixa} />
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
              <Bucket bucket={ativoCirculanteRendaVar} />
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
              <Bucket bucket={ativoCirculanteCripto} />
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
                <Bucket bucket={ativoNCBloqueado} />
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
              <Bucket bucket={passivoCartoes} />
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

function SectionHeader({ title, total }: { title: string; total: number }) {
  return (
    <div className="flex items-baseline justify-between border-b border-border pb-1">
      <span className="text-xs font-semibold uppercase tracking-wider text-strong">
        {title}
      </span>
      <span className="font-mono text-sm font-semibold tabular-nums text-strong">
        {formatBRL(total)}
      </span>
    </div>
  )
}

function SubSectionHeader({ title, total }: { title: string; total: number }) {
  return (
    <div className="mt-2 flex items-baseline justify-between pl-3">
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted">
        {title}
      </span>
      <span className="font-mono text-xs font-medium tabular-nums text-body">
        {formatBRL(total)}
      </span>
    </div>
  )
}

function AdjList({
  items,
  hint,
}: {
  items: Adjustment[]
  hint?: string
}) {
  if (items.length === 0) return null
  // Estrutura idêntica ao Bucket (ul com pl-7), pra manter alinhamento
  // vertical das contas e dos ajustes. Actions de editar/remover
  // ficam num slot absoluto ao lado, sem empurrar o valor.
  return (
    <>
      {hint && (
        <p className="pl-7 text-[10px] uppercase tracking-wider text-muted">
          {hint}
        </p>
      )}
      <ul className="space-y-0.5 pl-7">
        {items.map((a) => {
          const readonly = a.readonly_source != null
          return (
            <li
              key={a.id}
              className="group relative flex items-baseline justify-between gap-3 text-[11px] text-muted"
            >
              <span className="flex min-w-0 flex-1 items-baseline gap-1">
                <span>↳</span>
                <span className="truncate">{a.label}</span>
                {a.note && !readonly && (
                  <span
                    className="shrink-0 cursor-help text-[9px]"
                    title={a.note}
                  >
                    ⓘ
                  </span>
                )}
              </span>
              <span className="shrink-0 font-mono tabular-nums">
                {formatBRL(a.amount_cents)}
              </span>
              {!readonly && (
                <span className="no-print absolute right-0 top-1/2 -translate-y-1/2 translate-x-full pl-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <AdjustmentActions adjustment={a} />
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}

function Bucket({
  bucket,
}: {
  bucket:
    | {
        key: string
        label: string
        lines: { accountId: string; accountName: string; cents: number }[]
        total: number
      }
    | undefined
}) {
  if (!bucket || bucket.lines.length === 0) return null
  // Renderiza só as linhas (contas). O título + total do bucket já é
  // mostrado pelo SubSectionHeader no nível acima — evita duplicação.
  return (
    <ul className="space-y-0.5 pl-7">
      {[...bucket.lines]
        .sort((a, b) => b.cents - a.cents)
        .map((l) => (
          <li
            key={l.accountId}
            className="flex items-baseline justify-between gap-3 text-[11px] text-muted"
          >
            <span className="min-w-0 flex-1 truncate">
              ↳ {l.accountName}
            </span>
            <span className="shrink-0 font-mono tabular-nums">
              {formatBRL(l.cents)}
            </span>
          </li>
        ))}
    </ul>
  )
}
