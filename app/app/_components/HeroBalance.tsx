import {
  ArrowDown,
  ArrowUp,
  Banknote,
  Bitcoin,
  CreditCard,
  Landmark,
  LineChart,
  PiggyBank,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react"
import { formatBRL, formatBRLForScreenReader } from "@/lib/money"
import { BreakdownPanel, type BreakdownAccount } from "./BreakdownPanel"

export interface HeroBalanceProps {
  totalBalanceCents: number
  liquidCents: number
  savingsCents: number
  investmentCents: number
  cryptoCents: number
  fgtsCents: number
  creditCents: number
  liquidAccounts: BreakdownAccount[]
  savingsAccounts: BreakdownAccount[]
  investmentAccounts: BreakdownAccount[]
  cryptoAccounts: BreakdownAccount[]
  fgtsAccounts: BreakdownAccount[]
  creditAccounts: BreakdownAccount[]
  monthLabel: string
  monthNetCents: number
  incomeCents: number
  expenseCents: number
  deltaPct: number | null
  aside?: React.ReactNode
  currentWhy?: string
}

export function HeroBalance({
  totalBalanceCents,
  liquidCents,
  savingsCents,
  investmentCents,
  cryptoCents,
  fgtsCents,
  creditCents,
  liquidAccounts,
  savingsAccounts,
  investmentAccounts,
  cryptoAccounts,
  fgtsAccounts,
  creditAccounts,
  monthLabel,
  monthNetCents,
  incomeCents,
  expenseCents,
  deltaPct,
  aside,
  currentWhy,
}: HeroBalanceProps) {
  const totalNeg = totalBalanceCents < 0
  const monthNeg = monthNetCents < 0
  const pct = deltaPct != null ? Math.round(deltaPct * 100) : null
  const DeltaIcon = pct == null ? null : pct >= 0 ? TrendingUp : TrendingDown
  const deltaColor = pct == null ? "" : pct >= 0 ? "text-income" : "text-expense"

  // Conselheira de Design: removido gradient/radial overlay (chartjunk),
  // hierarquia agora reforça que "Saldo total agora" é O número (md:6xl);
  // saldo do mês/entrada/saída descem pra 2xl. aria-label em cada número
  // pra leitor de tela falar "saldo do mês: doze mil reais" em vez de
  // "R cifrão doze".
  return (
    <div className="relative overflow-hidden rounded-3xl border border-border bg-base p-8">
      <div className="relative space-y-6">
        <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-canvas">
              <Wallet className="h-5 w-5 text-strong" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-[10px] uppercase tracking-[0.22em] text-muted">
                Saldo total agora
              </p>
              {/* Fluid sizing: clamp(min, preferred-vw, max) escala com a
                  largura do viewport. Cap em ~text-5xl (48px) pra valor
                  caber em mobile (iPhone SE 320px) mesmo com R$ 1.000.000,00
                  (15 chars). Conselheira Design v3 pediu hero grande, mas
                  user reportou overflow em R$ 15.218 — clamp resolve sem
                  precisar truncar (perda de informação financeira). */}
              <p
                className={`font-mono font-semibold leading-none tabular-nums tracking-tight [font-size:clamp(1.625rem,6.5vw,3rem)] ${
                  totalNeg ? "text-expense" : "text-ink"
                }`}
                title={formatBRL(totalBalanceCents)}
                aria-label={`Saldo total agora: ${formatBRLForScreenReader(totalBalanceCents)}`}
              >
                {formatBRL(totalBalanceCents)}
              </p>
            </div>
          </div>
          {aside && <div className="min-w-0">{aside}</div>}
        </div>

        <div className="h-px bg-border" />

        <div className="grid gap-6 text-center md:grid-cols-3">
          <div className="flex flex-col items-center space-y-2">
            <p className="text-[10px] uppercase tracking-[0.22em] text-muted">
              Saldo do mês · {monthLabel}
            </p>
            <p
              className={`font-mono text-2xl font-semibold tabular-nums tracking-tight ${
                monthNeg ? "text-expense" : "text-strong"
              }`}
              aria-label={`Saldo do mês de ${monthLabel}: ${formatBRLForScreenReader(monthNetCents)}`}
            >
              {formatBRL(monthNetCents)}
            </p>
            {pct != null && DeltaIcon && (
              <p className={`flex items-center gap-1.5 text-xs font-medium ${deltaColor}`}>
                <DeltaIcon className="h-3.5 w-3.5" aria-hidden />
                {pct > 0 ? "+" : ""}
                {pct}% vs mês anterior
              </p>
            )}
            {currentWhy && (
              <p className="max-w-xs text-center text-xs leading-snug text-muted">
                {currentWhy}
              </p>
            )}
          </div>

          <div className="flex flex-col items-center">
            <p className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-[0.22em] text-muted">
              <ArrowUp className="h-3 w-3 text-income" aria-hidden />
              Entrada do mês
            </p>
            <p
              className="mt-2 font-mono text-2xl font-semibold tabular-nums text-strong"
              aria-label={`Entrada do mês: ${formatBRLForScreenReader(incomeCents)}`}
            >
              {formatBRL(incomeCents)}
            </p>
          </div>

          <div className="flex flex-col items-center">
            <p className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-[0.22em] text-muted">
              <ArrowDown className="h-3 w-3 text-expense" aria-hidden />
              Saída do mês
            </p>
            <p
              className="mt-2 font-mono text-2xl font-semibold tabular-nums text-strong"
              aria-label={`Saída do mês: ${formatBRLForScreenReader(expenseCents)}`}
            >
              {formatBRL(expenseCents)}
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <BreakdownPanel
            icon={<Banknote className="h-3 w-3" />}
            title="Conta Corrente"
            accounts={liquidAccounts}
            totalCents={liquidCents}
            emptyHint="Adicione uma conta corrente"
          />
          <BreakdownPanel
            icon={<Landmark className="h-3 w-3" />}
            title="Renda Fixa"
            accounts={savingsAccounts}
            totalCents={savingsCents}
            emptyHint="Cofrinhos, CDB, Tesouro"
          />
          <BreakdownPanel
            icon={<LineChart className="h-3 w-3" />}
            title="Renda Variável"
            accounts={investmentAccounts}
            totalCents={investmentCents}
            emptyHint="Ações, FII, ETF"
            dashed
          />
          <BreakdownPanel
            icon={<Bitcoin className="h-3 w-3" />}
            title="Cripto"
            accounts={cryptoAccounts}
            totalCents={cryptoCents}
            emptyHint="Bitcoin, ETH, outras"
            dashed
          />
          <BreakdownPanel
            icon={<CreditCard className="h-3 w-3" />}
            title="Cartão de Crédito"
            accounts={creditAccounts}
            totalCents={creditCents}
            emptyHint="Ainda sem cartões"
            dashed
            sortByDebt
            footnote={
              creditCents < 0
                ? "fatura em aberto — sai do saldo total quando paga"
                : undefined
            }
          />
          <BreakdownPanel
            icon={<PiggyBank className="h-3 w-3" />}
            title="FGTS"
            accounts={fgtsAccounts}
            totalCents={fgtsCents}
            emptyHint=""
            dashed
            footnote="não entra no saldo total"
          />
        </div>

      </div>
    </div>
  )
}
