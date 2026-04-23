import Link from "next/link"
import { ArrowRight, CheckSquare, FileText, TrendingUp, Tags } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

export const dynamic = "force-dynamic"

const REPORTS = [
  {
    href: "/app/relatorios/conciliacao",
    title: "Conciliação",
    description:
      "Prova matemática do saldo: saldo inicial + entradas − saídas = saldo final, por conta. Exporta PDF e XLSX.",
    icon: CheckSquare,
    status: "disponível",
  },
  {
    href: "/app/relatorios/fluxo-caixa",
    title: "Fluxo de caixa mensal",
    description:
      "Série histórica de entrada × saída × saldo ao longo dos meses, com categoria que mais pesou em cada mês. Exporta PDF e XLSX.",
    icon: TrendingUp,
    status: "disponível",
  },
  {
    href: "/app/relatorios/categorias",
    title: "Gastos por categoria",
    description:
      "Ranking de categorias e subcategorias no período escolhido, com percentual do total e barras visuais. Exporta PDF e XLSX.",
    icon: Tags,
    status: "disponível",
  },
] as const

export default function RelatoriosPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-strong">
          <FileText className="h-5 w-5" />
          Relatórios financeiros
        </h1>
        <p className="text-sm text-muted">
          Relatórios estruturados com prova matemática dos números. Cada um tem
          filtros de período e exporta em PDF e CSV.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {REPORTS.map((r) => {
          const Icon = r.icon
          const available = r.status === "disponível"
          const Content = (
            <Card
              className={`h-full transition-colors ${
                available ? "hover:border-muted" : "opacity-60"
              }`}
            >
              <CardContent className="flex h-full flex-col gap-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-subtle">
                    <Icon className="h-5 w-5 text-strong" />
                  </div>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                      available
                        ? "border-income/40 bg-income/10 text-income"
                        : "border-border bg-subtle text-muted"
                    }`}
                  >
                    {r.status}
                  </span>
                </div>
                <div className="flex-1 space-y-1">
                  <h2 className="text-base font-medium text-strong">{r.title}</h2>
                  <p className="text-xs leading-snug text-body">
                    {r.description}
                  </p>
                </div>
                {available && (
                  <div className="flex items-center gap-1 text-xs font-medium text-strong">
                    Abrir
                    <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                )}
              </CardContent>
            </Card>
          )
          return available ? (
            <Link key={r.title} href={r.href}>
              {Content}
            </Link>
          ) : (
            <div key={r.title}>{Content}</div>
          )
        })}
      </div>
    </div>
  )
}
