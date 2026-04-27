"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatBRL } from "@/lib/money"

export function BanksRankCard({
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
