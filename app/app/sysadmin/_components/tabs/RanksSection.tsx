"use client"

import { formatBRL } from "@/lib/money"
import { AggregateRankCard } from "../AggregateRankCard"
import { BanksRankCard } from "../BanksRankCard"

export function RanksSection({
  topBanks,
  topCategories,
  topSubcategories,
}: {
  topBanks: Array<{ bank: string; count: number; totalCents: number }>
  topCategories: Array<{ name: string; amountCents: number }>
  topSubcategories: Array<{ label: string; amountCents: number; parent: string }>
}) {
  return (
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
  )
}
