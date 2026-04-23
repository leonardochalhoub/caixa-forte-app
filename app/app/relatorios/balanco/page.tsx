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
  AddLineButton,
  AdjustmentActions,
  type Adjustment,
} from "./_components/AdjustmentForm"

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
}

interface SearchParams {
  periodo?: string
}

// "mensal:2026-04" | "anual:2026"
function parsePeriod(p: string): {
  kind: "mensal" | "anual"
  year: number
  month?: number
  snapshotDate: string
  label: string
} {
  if (p.startsWith("anual:")) {
    const y = Number(p.slice(6))
    return {
      kind: "anual",
      year: y,
      snapshotDate: `${y}-12-31`,
      label: `Anual ${y}`,
    }
  }
  const ym = p.startsWith("mensal:") ? p.slice(7) : p
  const [yStr, mStr] = ym.split("-")
  const y = Number(yStr)
  const m = Number(mStr)
  const lastDay = new Date(y, m, 0).getDate()
  return {
    kind: "mensal",
    year: y,
    month: m,
    snapshotDate: `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
    label: `${MONTH_NAMES_PT[m - 1]} ${y}`,
  }
}

const TYPE_CLASSIFICATION = {
  checking: "ativo_circulante_disponivel",
  cash: "ativo_circulante_disponivel",
  wallet: "ativo_circulante_disponivel",
  savings: "ativo_nc_investimento_renda_fixa",
  poupanca: "ativo_nc_investimento_renda_fixa",
  investment: "ativo_nc_investimento_renda_variavel",
  crypto: "ativo_nc_investimento_cripto",
  fgts: "ativo_nc_bloqueado",
  credit: "passivo_circulante_cartoes",
} as const

type ClassificationKey = (typeof TYPE_CLASSIFICATION)[keyof typeof TYPE_CLASSIFICATION]

const SECTION_LABELS: Record<ClassificationKey, string> = {
  ativo_circulante_disponivel: "Disponibilidades",
  ativo_nc_investimento_renda_fixa: "Renda Fixa",
  ativo_nc_investimento_renda_variavel: "Renda Variável",
  ativo_nc_investimento_cripto: "Cripto",
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
    supabase
      .from("accounts")
      .select("id, name, type, opening_balance_cents")
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
      .select("id, period, line_key, label, amount_cents, note")
      .eq("user_id", user.id)
      .eq("period", periodStr),
  ])

  type AdjRow = {
    id: string
    period: string
    line_key: string
    label: string
    amount_cents: number
    note: string | null
  }
  const adjustments = (adjustmentsRaw ?? []) as AdjRow[]
  const adjustmentsBySection = new Map<string, Adjustment[]>()
  for (const a of adjustments) {
    const [section] = a.line_key.split("::")
    if (!section) continue
    const list = adjustmentsBySection.get(section) ?? []
    list.push({
      id: a.id,
      label: a.label,
      amount_cents: a.amount_cents,
      note: a.note,
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
    const key = TYPE_CLASSIFICATION[a.type as keyof typeof TYPE_CLASSIFICATION]
    if (!key) continue
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
  const ativoNCRendaFixa = buckets.get("ativo_nc_investimento_renda_fixa")
  const ativoNCRendaVar = buckets.get("ativo_nc_investimento_renda_variavel")
  const ativoNCCripto = buckets.get("ativo_nc_investimento_cripto")
  const ativoNCBloqueado = buckets.get("ativo_nc_bloqueado")
  const passivoCartoes = buckets.get("passivo_circulante_cartoes")

  const ativoCirculanteTotal =
    (ativoCirculanteDisponivel?.total ?? 0) +
    sumAdj("ativo_circulante_disponivel") +
    sumAdj("ativo_circulante_outros")
  const ativoNCInvestimentosTotal =
    (ativoNCRendaFixa?.total ?? 0) +
    (ativoNCRendaVar?.total ?? 0) +
    (ativoNCCripto?.total ?? 0) +
    sumAdj("ativo_nc_investimento_renda_fixa") +
    sumAdj("ativo_nc_investimento_renda_variavel") +
    sumAdj("ativo_nc_investimento_cripto") +
    sumAdj("ativo_nc_investimentos_outros")
  const ativoNCBloqueadoTotal =
    (ativoNCBloqueado?.total ?? 0) + sumAdj("ativo_nc_bloqueado")
  const ativoNCImobilizadoTotal = sumAdj("ativo_nc_imobilizado")
  const ativoNCIntangivelTotal = sumAdj("ativo_nc_intangivel")
  const ativoNCTotal =
    ativoNCInvestimentosTotal +
    ativoNCBloqueadoTotal +
    ativoNCImobilizadoTotal +
    ativoNCIntangivelTotal
  const ativoTotal = ativoCirculanteTotal + ativoNCTotal

  const passivoCirculanteTotal =
    (passivoCartoes?.total ?? 0) +
    sumAdj("passivo_circulante_cartoes") +
    sumAdj("passivo_circulante_outros")
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

  // Períodos disponíveis = meses + anos que têm alguma tx real OU
  // algum ajuste manual OU é o mês atual (sempre acessível pra
  // planejamento futuro).
  const activeMonths = new Set<string>()
  const activeYears = new Set<number>()
  for (const t of txs) {
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
    ["    Disponibilidades", ativoCirculanteDisponivel?.total ?? 0 / 100],
    ...(ativoCirculanteDisponivel?.lines.map((l) => [
      `      ${l.accountName}`,
      l.cents / 100,
    ]) ?? []),
    ["  Ativo Não Circulante"],
    ["    Renda Fixa", (ativoNCRendaFixa?.total ?? 0) / 100],
    ...(ativoNCRendaFixa?.lines.map((l) => [
      `      ${l.accountName}`,
      l.cents / 100,
    ]) ?? []),
    ["    Renda Variável", (ativoNCRendaVar?.total ?? 0) / 100],
    ...(ativoNCRendaVar?.lines.map((l) => [
      `      ${l.accountName}`,
      l.cents / 100,
    ]) ?? []),
    ["    Cripto", (ativoNCCripto?.total ?? 0) / 100],
    ...(ativoNCCripto?.lines.map((l) => [
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
        <PrintActions
          rows={xlsxRows}
          filename={`balanco-${periodStr.replace(":", "-")}.xlsx`}
          sheetName={period.label}
        />
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

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ATIVO */}
        <section className="avoid-break space-y-3 rounded-2xl border-2 border-border p-5">
          <h2 className="font-serif text-xl text-strong">ATIVO</h2>

          <div className="space-y-2">
            <SectionHeader
              title="Ativo Circulante"
              total={ativoCirculanteTotal}
            />
            <Bucket bucket={ativoCirculanteDisponivel} />
            <AdjList
              items={adjustmentsBySection.get("ativo_circulante_disponivel") ?? []}
            />
            <AdjList
              items={adjustmentsBySection.get("ativo_circulante_outros") ?? []}
              hint="Outros ativos circulantes"
            />
            <div className="no-print pl-4">
              <AddLineButton
                period={periodStr}
                section="ativo_circulante_outros"
                hint="Recebíveis curto prazo, adiantamentos, estoques, etc."
              />
            </div>
          </div>

          <div className="space-y-2 pt-3">
            <SectionHeader title="Ativo Não Circulante" total={ativoNCTotal} />
            <div className="pl-2">
              <SubSectionHeader
                title="Investimentos"
                total={ativoNCInvestimentosTotal}
              />
              <Bucket bucket={ativoNCRendaFixa} />
              <Bucket bucket={ativoNCRendaVar} />
              <Bucket bucket={ativoNCCripto} />
              <AdjList
                items={
                  adjustmentsBySection.get("ativo_nc_investimentos_outros") ?? []
                }
                hint="Outros investimentos"
              />
              <div className="no-print pl-4">
                <AddLineButton
                  period={periodStr}
                  section="ativo_nc_investimentos_outros"
                  hint="Participações, fundos, investimentos não trackeados"
                />
              </div>
            </div>
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
              <div className="no-print pl-4">
                <AddLineButton
                  period={periodStr}
                  section="ativo_nc_imobilizado"
                  hint="Imóveis, veículos, equipamentos (valor de mercado)"
                />
              </div>
            </div>
            <div className="pl-2">
              <SubSectionHeader
                title="Intangível"
                total={ativoNCIntangivelTotal}
              />
              <AdjList
                items={adjustmentsBySection.get("ativo_nc_intangivel") ?? []}
              />
              <div className="no-print pl-4">
                <AddLineButton
                  period={periodStr}
                  section="ativo_nc_intangivel"
                  hint="Marcas, patentes, software próprio, domínios"
                />
              </div>
            </div>
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
            <Bucket bucket={passivoCartoes} />
            <AdjList
              items={adjustmentsBySection.get("passivo_circulante_cartoes") ?? []}
            />
            <AdjList
              items={adjustmentsBySection.get("passivo_circulante_outros") ?? []}
              hint="Outros passivos circulantes"
            />
            <div className="no-print pl-4">
              <AddLineButton
                period={periodStr}
                section="passivo_circulante_outros"
                hint="Contas a pagar, salários, impostos, empréstimo curto prazo"
              />
            </div>
          </div>

          <div className="space-y-2 pt-3">
            <SectionHeader title="Passivo Não Circulante" total={passivoNCTotal} />
            <AdjList
              items={
                adjustmentsBySection.get("passivo_nc_financiamentos") ?? []
              }
            />
            <div className="no-print pl-4">
              <AddLineButton
                period={periodStr}
                section="passivo_nc_financiamentos"
                hint="Financiamento imóvel, empréstimo longo, consignado"
              />
            </div>
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
    <div className="mt-2 flex items-baseline justify-between">
      <span className="text-[11px] uppercase tracking-wider text-muted">
        {title}
      </span>
      <span className="font-mono text-xs tabular-nums text-body">
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
  return (
    <div className="space-y-1 pl-4 text-xs">
      {hint && (
        <p className="text-[10px] uppercase tracking-wider text-muted">{hint}</p>
      )}
      <ul className="space-y-0.5 pl-3">
        {items.map((a) => (
          <li
            key={a.id}
            className="group flex items-baseline justify-between gap-2 text-[11px] text-body"
          >
            <span className="flex items-baseline gap-1">
              <span className="text-muted">↳</span>
              {a.label}
              {a.note && (
                <span
                  className="cursor-help text-[9px] text-muted"
                  title={a.note}
                >
                  ⓘ
                </span>
              )}
            </span>
            <span className="flex items-center gap-2">
              <span className="font-mono tabular-nums">
                {formatBRL(a.amount_cents)}
              </span>
              <span className="no-print opacity-0 transition-opacity group-hover:opacity-100">
                <AdjustmentActions adjustment={a} />
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
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
  return (
    <div className="space-y-1 pl-4 text-xs">
      <div className="flex items-baseline justify-between text-body">
        <span>{bucket.label}</span>
        <span className="font-mono tabular-nums">
          {formatBRL(bucket.total)}
        </span>
      </div>
      <ul className="space-y-0.5 pl-3">
        {[...bucket.lines]
          .sort((a, b) => b.cents - a.cents)
          .map((l) => (
            <li
              key={l.accountId}
              className="flex items-baseline justify-between text-[11px] text-muted"
            >
              <span>↳ {l.accountName}</span>
              <span className="font-mono tabular-nums">
                {formatBRL(l.cents)}
              </span>
            </li>
          ))}
      </ul>
    </div>
  )
}
