"use client"

import { useMemo, useState, useTransition } from "react"
import {
  ArrowDownRight,
  ArrowUpRight,
  MapPin,
  MousePointerClick,
  Minus,
  Search,
  Users,
  Wallet,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/toast"
import { formatBRL } from "@/lib/money"
import { BR_STATES } from "@/lib/ibge"
import { BrazilMap, type UserPin } from "./BrazilMap"
import { setRoleAction } from "../actions"

interface UserRow {
  user_id: string
  email: string | null
  display_name: string | null
  role: string
  city_name: string | null
  uf: string | null
  onboarded_at: string | null
  created_at: string
  last_login_at: string | null
  login_count: number
}

interface LoginEvent {
  id: number
  user_id: string
  happened_at: string
  ip: string | null
  user_agent: string | null
}

interface Kpi {
  totalUsers: number
  onboardedUsers: number
  avgBalanceCents: number
  medianBalanceCents: number
  trendDirection: "rising" | "falling" | "flat"
  formattedAvg: string
  formattedMedian: string
  trend1m: { net: number; direction: "rising" | "falling" | "flat"; why?: string }
  trend6m: { net: number; direction: "rising" | "falling" | "flat"; why?: string }
  trend12m: { net: number; direction: "rising" | "falling" | "flat"; why?: string }
  demoClicks: {
    total: number
    last24h: number
    last7d: number
    uniqueIps: number
  }
}

interface Props {
  rows: UserRow[]
  recentEvents: LoginEvent[]
  kpi: Kpi
  trend: Array<{ month: string; net: number; income: number; expense: number }>
  ufCounts: Array<{ uf: string; count: number }>
  userPins: UserPin[]
  topBanks: Array<{ bank: string; count: number; totalCents: number }>
  topCategories: Array<{ name: string; amountCents: number }>
  topSubcategories: Array<{ label: string; amountCents: number; parent: string }>
  currentUserIsOwner: boolean
}

export function SysadminDashboard({
  rows,
  recentEvents,
  kpi,
  trend,
  ufCounts,
  userPins,
  topBanks,
  topCategories,
  topSubcategories,
  currentUserIsOwner,
}: Props) {
  const [search, setSearch] = useState("")

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      return (
        (r.email ?? "").toLowerCase().includes(q) ||
        (r.display_name ?? "").toLowerCase().includes(q) ||
        (r.city_name ?? "").toLowerCase().includes(q) ||
        (r.uf ?? "").toLowerCase().includes(q)
      )
    })
  }, [rows, search])

  const usersByIdForLogins = useMemo(() => {
    const m = new Map<string, UserRow>()
    for (const r of rows) m.set(r.user_id, r)
    return m
  }, [rows])

  void trend

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-strong">Painel do Sysadmin</h1>
        <p className="text-sm text-muted">
          Métricas agregadas do Caixa Forte. Por privacidade, nunca exibimos saldo ou
          transações individuais aqui — apenas agregados e dados de acesso.
        </p>
      </header>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={<Users className="h-4 w-4" />}
          label="Usuários"
          value={kpi.totalUsers.toString()}
          subtitle={`${kpi.onboardedUsers} onboarded`}
        />
        <KpiCard
          icon={<Wallet className="h-4 w-4" />}
          label="Patrimônio médio por usuário"
          value={kpi.formattedAvg}
          subtitle={`mediana ${kpi.formattedMedian} · inclui FGTS`}
        />
        <KpiCard
          icon={<MapPin className="h-4 w-4" />}
          label="Estados ativos"
          value={ufCounts.length.toString()}
          subtitle={`de ${BR_STATES.length}`}
        />
        <KpiCard
          icon={<Users className="h-4 w-4" />}
          label="Pins no mapa"
          value={userPins.length.toString()}
          subtitle="usuários com cidade"
        />
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={<MousePointerClick className="h-4 w-4" />}
          label="Demo · total de cliques"
          value={kpi.demoClicks.total.toString()}
          subtitle="landing → conta da Larissa"
        />
        <KpiCard
          icon={<MousePointerClick className="h-4 w-4" />}
          label="Demo · últimas 24h"
          value={kpi.demoClicks.last24h.toString()}
          subtitle="cliques no último dia"
        />
        <KpiCard
          icon={<MousePointerClick className="h-4 w-4" />}
          label="Demo · últimos 7 dias"
          value={kpi.demoClicks.last7d.toString()}
          subtitle="cliques na última semana"
        />
        <KpiCard
          icon={<MousePointerClick className="h-4 w-4" />}
          label="Demo · IPs únicos"
          value={kpi.demoClicks.uniqueIps.toString()}
          subtitle="visitantes distintos"
        />
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <TrendKpi
          label="Tendência · mês atual"
          net={kpi.trend1m.net}
          direction={kpi.trend1m.direction}
          why={kpi.trend1m.why}
        />
        <TrendKpi
          label="Tendência · últimos 6 meses"
          net={kpi.trend6m.net}
          direction={kpi.trend6m.direction}
          why={kpi.trend6m.why}
        />
        <TrendKpi
          label="Tendência · últimos 12 meses"
          net={kpi.trend12m.net}
          direction={kpi.trend12m.direction}
          why={kpi.trend12m.why}
        />
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>Distribuição geográfica</CardTitle>
            <CardDescription>
              Pins por usuário. Azul · Masculino, rosa · Feminino, cinza ·
              não informado. Passe o mouse em cima para ver nome, cidade e
              dias de plataforma.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BrazilMap userPins={userPins} ufCounts={ufCounts} />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <BanksRankCard banks={topBanks} />
        <AggregateRankCard
          title="Categorias com mais gasto"
          description="Soma agregada, sem detalhes por usuário."
          rows={topCategories.map((c) => ({
            label: c.name,
            value: formatBRL(c.amountCents),
            weight: c.amountCents,
          }))}
          emptyLabel="Sem despesas registradas."
        />
        <AggregateRankCard
          title="Subcategorias com mais gasto"
          description="Pares categoria > subcategoria, agregado."
          rows={topSubcategories.map((s) => ({
            label: s.label,
            value: formatBRL(s.amountCents),
            weight: s.amountCents,
          }))}
          emptyLabel="Sem despesas em subcategorias."
        />
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-strong">Usuários</h2>
            <p className="text-xs text-muted">
              Identidade + atividade + gestão de role. Sem saldo individual.
            </p>
          </div>
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por email, nome, cidade..."
              className="pl-8"
            />
          </div>
        </div>
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-4 py-2.5">Usuário</th>
                  <th className="px-4 py-2.5">Cidade</th>
                  <th className="px-4 py-2.5">Role</th>
                  <th className="px-4 py-2.5 text-right">Logins</th>
                  <th className="px-4 py-2.5">Último acesso</th>
                  <th className="px-4 py-2.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredRows.map((r) => (
                  <UserRowItem
                    key={r.user_id}
                    row={r}
                    canManage={currentUserIsOwner}
                  />
                ))}
                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-muted">
                      Nenhum usuário encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-strong">Atividade dos usuários</h2>
        <p className="text-xs text-muted">
          Uma linha por usuário, ordenado pelo heartbeat mais recente. Total de
          acessos detectados: {recentEvents.length}.
        </p>
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-4 py-2.5">Usuário</th>
                  <th className="px-4 py-2.5">Última atividade</th>
                  <th className="px-4 py-2.5 text-right">Logins</th>
                  <th className="px-4 py-2.5">Último IP</th>
                  <th className="px-4 py-2.5">Último navegador</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {buildActivityRows(rows, recentEvents).map((a) => (
                  <tr key={a.user_id} className="text-body">
                    <td className="px-4 py-2">
                      <span className="block text-strong">
                        {a.display_name || a.email || a.user_id.slice(0, 8)}
                      </span>
                      <span className="block text-[11px] text-muted">{a.email}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-muted">
                      {a.last_at ? formatIsoToLocal(a.last_at) : "—"}
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums">
                      {a.login_count}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-muted">
                      {a.last_ip ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-[11px] text-muted">
                      {shortUA(a.last_ua)}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-muted">
                      Sem atividade ainda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

function UserRowItem({ row: r, canManage }: { row: UserRow; canManage: boolean }) {
  const [pending, start] = useTransition()

  const roleBadge =
    r.role === "owner"
      ? "bg-strong text-canvas"
      : r.role === "admin"
        ? "bg-border text-strong"
        : "bg-subtle text-muted"

  function handleToggleAdmin() {
    if (r.role === "owner") return
    const next = r.role === "admin" ? "user" : "admin"
    start(async () => {
      try {
        await setRoleAction({ userId: r.user_id, role: next })
        toast.success(`${r.display_name || r.email} agora é ${next}.`)
      } catch (error) {
        toast.error((error as Error).message)
      }
    })
  }

  return (
    <tr className="text-body">
      <td className="px-4 py-2">
        <span className="block text-strong">
          {r.display_name || r.email || r.user_id.slice(0, 8)}
        </span>
        <span className="block text-[11px] text-muted">{r.email}</span>
      </td>
      <td className="px-4 py-2">
        {r.city_name ? (
          <span className="text-body">
            {r.city_name} <span className="text-muted">· {r.uf}</span>
          </span>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td className="px-4 py-2">
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${roleBadge}`}
        >
          {r.role}
        </span>
      </td>
      <td className="px-4 py-2 text-right font-mono tabular-nums">
        {r.login_count}
      </td>
      <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-muted">
        {r.last_login_at ? formatIsoToLocal(r.last_login_at) : "—"}
      </td>
      <td className="px-4 py-2 text-right">
        {canManage && r.role !== "owner" ? (
          <Button
            size="sm"
            variant="outline"
            onClick={handleToggleAdmin}
            disabled={pending}
          >
            {r.role === "admin" ? "Revogar admin" : "Tornar admin"}
          </Button>
        ) : (
          <span className="text-xs text-muted">
            {r.role === "owner" ? "owner" : "—"}
          </span>
        )}
      </td>
    </tr>
  )
}

function KpiCard({
  icon,
  label,
  value,
  subtitle,
}: {
  icon: React.ReactNode
  label: string
  value: string
  subtitle?: string
}) {
  return (
    <Card>
      <CardContent className="space-y-2 p-5">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-muted">
          {icon}
          {label}
        </div>
        <p className="font-mono text-2xl font-semibold tabular-nums tracking-tight text-strong">
          {value}
        </p>
        {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
      </CardContent>
    </Card>
  )
}

function BanksRankCard({
  banks,
}: {
  banks: Array<{ bank: string; count: number; totalCents: number }>
}) {
  const maxCount = Math.max(1, ...banks.map((b) => b.count))
  return (
    <Card>
      <CardHeader>
        <CardTitle>Bancos mais usados</CardTitle>
        <CardDescription>
          Contagem de contas registradas + valor total agregado por marca.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {banks.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            Nenhuma conta criada ainda.
          </p>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-left text-[10px] uppercase tracking-wider text-muted">
              <tr>
                <th className="pb-2">Banco</th>
                <th className="pb-2 text-right">Contas</th>
                <th className="pb-2 text-right">Valor total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {banks.map((b) => {
                const pct = Math.max(6, Math.round((b.count / maxCount) * 100))
                return (
                  <tr key={b.bank} className="text-body">
                    <td className="py-1.5 pr-2">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-body" title={b.bank}>
                          {b.bank}
                        </span>
                      </div>
                      <div className="mt-1 h-1 w-full overflow-hidden rounded bg-subtle">
                        <div
                          className="h-full bg-strong/70"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </td>
                    <td className="py-1.5 text-right font-mono tabular-nums text-strong">
                      {b.count}
                    </td>
                    <td className="py-1.5 text-right font-mono tabular-nums text-strong">
                      {formatBRL(b.totalCents)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  )
}

function AggregateRankCard({
  title,
  description,
  rows,
  emptyLabel,
}: {
  title: string
  description: string
  rows: Array<{ label: string; value: string; weight: number }>
  emptyLabel: string
}) {
  const max = Math.max(1, ...rows.map((r) => r.weight))
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">{emptyLabel}</p>
        ) : (
          <ul className="space-y-1.5">
            {rows.map((r) => {
              const pct = Math.max(4, Math.round((r.weight / max) * 100))
              return (
                <li key={r.label} className="flex items-center gap-3 text-xs">
                  <span className="w-28 shrink-0 truncate text-body" title={r.label}>
                    {r.label}
                  </span>
                  <div className="relative h-4 flex-1 overflow-hidden rounded bg-subtle">
                    <div
                      className="absolute inset-y-0 left-0 bg-strong/70"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-20 shrink-0 text-right font-mono tabular-nums text-strong">
                    {r.value}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function buildActivityRows(
  rows: UserRow[],
  events: LoginEvent[],
): Array<
  UserRow & {
    last_at: string | null
    last_ip: string | null
    last_ua: string | null
  }
> {
  // events already arrive sorted DESC by happened_at — first occurrence per
  // user_id wins, which is exactly the latest event for that user.
  const latest = new Map<string, LoginEvent>()
  for (const e of events) {
    if (!latest.has(e.user_id)) latest.set(e.user_id, e)
  }
  return [...rows]
    .map((r) => {
      const e = latest.get(r.user_id)
      return {
        ...r,
        last_at: e?.happened_at ?? r.last_login_at,
        last_ip: e?.ip ?? null,
        last_ua: e?.user_agent ?? null,
      }
    })
    .sort((a, b) => {
      const aT = a.last_at ? new Date(a.last_at).getTime() : 0
      const bT = b.last_at ? new Date(b.last_at).getTime() : 0
      return bT - aT
    })
}

function TrendKpi({
  label,
  direction,
  why,
}: {
  label: string
  net: number
  direction: "rising" | "falling" | "flat"
  why?: string
}) {
  const status =
    direction === "rising"
      ? "Enriquecendo"
      : direction === "falling"
        ? "Empobrecendo"
        : "Estável"
  const color =
    direction === "rising"
      ? "text-income"
      : direction === "falling"
        ? "text-expense"
        : "text-muted"
  return (
    <Card>
      <CardContent className="space-y-2 p-5">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-muted">
          <TrendIcon dir={direction} />
          {label}
        </div>
        <p
          className={`font-mono text-2xl font-semibold tabular-nums tracking-tight ${color}`}
        >
          {status}
        </p>
        {why && <p className="text-xs leading-snug text-body">{why}</p>}
      </CardContent>
    </Card>
  )
}

function TrendIcon({ dir }: { dir: "rising" | "falling" | "flat" }) {
  if (dir === "rising") return <ArrowUpRight className="h-4 w-4 text-income" />
  if (dir === "falling") return <ArrowDownRight className="h-4 w-4 text-expense" />
  return <Minus className="h-4 w-4" />
}

function formatIsoToLocal(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return iso
  }
}

function shortUA(ua: string | null): string {
  if (!ua) return "—"
  const chrome = ua.match(/Chrome\/([0-9.]+)/)?.[1]
  const firefox = ua.match(/Firefox\/([0-9.]+)/)?.[1]
  const safari = ua.match(/Version\/([0-9.]+).*Safari/)?.[1]
  if (chrome) return `Chrome ${chrome.split(".")[0]}`
  if (firefox) return `Firefox ${firefox.split(".")[0]}`
  if (safari) return `Safari ${safari.split(".")[0]}`
  return ua.slice(0, 40)
}
