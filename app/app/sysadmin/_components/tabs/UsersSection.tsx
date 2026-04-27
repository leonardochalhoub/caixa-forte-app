"use client"

import { useMemo, useState, useTransition } from "react"
import { Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/toast"
import { formatIsoToLocal } from "@/lib/sysadmin/helpers"
import type { UserRow } from "@/lib/sysadmin/types"
import { setRoleAction } from "../../actions"

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

export function UsersSection({
  rows,
  currentUserIsOwner,
}: {
  rows: UserRow[]
  currentUserIsOwner: boolean
}) {
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

  return (
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
  )
}
