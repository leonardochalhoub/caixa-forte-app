"use client"

import { Card, CardContent } from "@/components/ui/card"
import { buildActivityRows, formatIsoToLocal, shortUA } from "@/lib/sysadmin/helpers"
import type { LoginEvent, UserRow } from "@/lib/sysadmin/types"

export function ActivitySection({
  rows,
  recentEvents,
}: {
  rows: UserRow[]
  recentEvents: LoginEvent[]
}) {
  return (
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
  )
}
