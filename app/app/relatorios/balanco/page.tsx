export const dynamic = "force-dynamic"
export const revalidate = 0

import { Scale } from "lucide-react"
import { requireOnboardedUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { formatBRL } from "@/lib/money"
import { PrintActions } from "../conciliacao/_components/PrintActions"
import { BalancoPeriodSelector } from "./_components/BalancoPeriodSelector"
import { BalancoAIInsight } from "./_components/BalancoAIInsight"
import { AddRegistryButton } from "./_components/RegistryForm"
import { autoSyncFipeForPeriod } from "@/lib/reports/balanco-fipe-sync"
import { type SearchParams, parsePeriod } from "@/lib/reports/balanco"
import {
  fetchBalancoCore,
  fetchBalancoRegistries,
} from "@/lib/reports/balanco-queries"
import {
  buildBuckets,
  buildPeriodOptions,
  computeBalancoTotals,
  computeOverdueLiabilities,
  groupAdjustmentsBySection,
  makeSumAdj,
  periodPrefixOf,
} from "@/lib/reports/balanco-helpers"
import { buildBalancoAiSnapshot } from "@/lib/reports/balanco-snapshot"
import { buildBalancoXlsxRows } from "@/lib/reports/balanco-xlsx"
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

  // === Fetch ===
  const [{ accounts, txs, profile, adjustments: adjustmentsRaw }, registries] =
    await Promise.all([
      fetchBalancoCore(supabase, user.id, periodStr),
      fetchBalancoRegistries(supabase, user.id, periodStr),
    ])

  // Auto-sync FIPE: ao abrir QUALQUER período (mensal ou anual), propaga
  // ajustes FIPE existentes pra esse period. Sem isso, mudar de
  // "mensal:2026-04" pra "anual:2026" some com o ajuste do carro
  // (a query filtra por period exato). Bug reportado pelo user.
  let adjustments = adjustmentsRaw
  const newAdjs = await autoSyncFipeForPeriod(
    supabase,
    user.id,
    periodStr,
    adjustments,
  )
  if (newAdjs.length > 0) adjustments = [...adjustments, ...newAdjs]

  // === Agregações ===
  const adjustmentsBySection = groupAdjustmentsBySection(adjustments)
  const sumAdj = makeSumAdj(adjustmentsBySection)

  const periodPrefix = periodPrefixOf(period)
  const buckets = buildBuckets(accounts, txs, snapshotDate, periodPrefix)
  const overdueLiabilities = computeOverdueLiabilities(
    txs,
    accounts,
    snapshotDate,
  )
  const totals = computeBalancoTotals(buckets, sumAdj, overdueLiabilities)

  // Buckets usados em múltiplos pontos da UI
  const ativoCirculanteDisponivel = buckets.get("ativo_circulante_disponivel")
  const ativoCirculanteRendaFixa = buckets.get("ativo_circulante_renda_fixa")
  const ativoCirculanteRendaVar = buckets.get("ativo_circulante_renda_variavel")
  const ativoCirculanteCripto = buckets.get("ativo_circulante_cripto")
  const ativoNCBloqueado = buckets.get("ativo_nc_bloqueado")
  const passivoCartoes = buckets.get("passivo_circulante_cartoes")

  // === Outputs derivados (snapshot IA, XLSX, options) ===
  const aiSnapshot = buildBalancoAiSnapshot({
    periodLabel: period.label,
    snapshotDate,
    buckets,
    adjustmentsBySection,
    totals,
    overdueLiabilities,
  })

  const xlsxRows = buildBalancoXlsxRows({
    periodLabel: period.label,
    snapshotDate,
    buckets,
    adjustmentsBySection,
    totals,
    overdueLiabilities,
    registries,
    sumAdj,
  })

  const { periodOptions, yearOptions } = buildPeriodOptions(txs, adjustments)

  // === Cabeçalho do relatório ===
  const displayName =
    profile?.display_name ??
    (user.user_metadata as { display_name?: string; full_name?: string } | null)
      ?.display_name ??
    user.email ??
    ""
  const generatedAt = new Date().toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  })

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
              total={totals.ativoCirculanteTotal}
            />
            <div className="pl-2">
              <SubSectionHeader
                title="Disponibilidades"
                total={totals.ativoCirculanteDisponivelTotal}
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
                total={totals.ativoCirculanteRendaFixaTotal}
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
                total={totals.ativoCirculanteRendaVarTotal}
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
                total={totals.ativoCirculanteCriptoTotal}
              />
              <BucketBlock bucket={ativoCirculanteCripto} />
              <AdjList
                items={adjustmentsBySection.get("ativo_circulante_cripto") ?? []}
              />
            </div>
          </div>

          <div className="space-y-2 pt-3">
            <SectionHeader
              title="Ativo Não Circulante"
              total={totals.ativoNCTotal}
            />
            {totals.ativoNCBloqueadoTotal > 0 && (
              <div className="pl-2">
                <SubSectionHeader
                  title="Recursos Bloqueados"
                  total={totals.ativoNCBloqueadoTotal}
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
                total={totals.ativoNCImobilizadoTotal}
              />
              <AdjList
                items={adjustmentsBySection.get("ativo_nc_imobilizado") ?? []}
              />
            </div>
            {(totals.ativoNCIntangivelTotal !== 0 ||
              (adjustmentsBySection.get("ativo_nc_intangivel") ?? []).length >
                0) && (
              <div className="pl-2">
                <SubSectionHeader
                  title="Intangível"
                  total={totals.ativoNCIntangivelTotal}
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
              {formatBRL(totals.ativoTotal)}
            </span>
          </div>
        </section>

        {/* PASSIVO + PL */}
        <section className="avoid-break space-y-3 rounded-2xl border-2 border-border p-5">
          <h2 className="font-serif text-xl text-strong">PASSIVO + PL</h2>

          <div className="space-y-2">
            <SectionHeader
              title="Passivo Circulante"
              total={totals.passivoCirculanteTotal}
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
                  total={totals.overdueLiabilitiesTotal}
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
              total={totals.passivoNCTotal}
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
              {formatBRL(totals.passivoTotal)}
            </span>
          </div>

          <div className="space-y-2 pt-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold uppercase tracking-wider text-strong">
                Patrimônio Líquido
              </span>
              <span
                className={`font-mono text-lg font-bold tabular-nums ${
                  totals.patrimonioLiquido >= 0 ? "text-income" : "text-expense"
                }`}
              >
                {formatBRL(totals.patrimonioLiquido)}
              </span>
            </div>
            <p className="text-[10px] italic text-muted">
              = Ativo − Passivo ({formatBRL(totals.ativoTotal)} −{" "}
              {formatBRL(totals.passivoTotal)})
            </p>
          </div>

          <div className="flex items-baseline justify-between border-t-2 border-border pt-3">
            <span className="text-sm font-semibold uppercase tracking-wider text-strong">
              Total Passivo + PL
            </span>
            <span className="font-mono text-xl font-bold tabular-nums text-strong">
              {formatBRL(totals.passivoTotal + totals.patrimonioLiquido)}
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
            {formatBRL(totals.ativoTotal)}
          </span>
          <span className="text-muted">=</span>
          <span>Passivo</span>
          <span className="font-mono font-semibold text-strong">
            {formatBRL(totals.passivoTotal)}
          </span>
          <span className="text-muted">+</span>
          <span>Patrimônio Líquido</span>
          <span
            className={`font-mono font-semibold ${
              totals.patrimonioLiquido >= 0 ? "text-income" : "text-expense"
            }`}
          >
            {formatBRL(totals.patrimonioLiquido)}
          </span>
          <span className={totals.balanced ? "text-income" : "text-expense"}>
            {totals.balanced ? "✓ balanceado" : "✗ desbalanceado"}
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
