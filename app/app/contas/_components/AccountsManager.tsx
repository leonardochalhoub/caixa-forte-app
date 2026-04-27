"use client"

import { useTransition } from "react"
import { toast } from "@/components/ui/toast"
import {
  groupByBank,
  TYPE_LABELS,
  type AccountListItem,
} from "@/lib/accounts/helpers"
import { archiveAccount } from "../actions"
import { BankCard } from "./BankCard"
import { CreateAccountForm } from "./CreateAccountForm"

export function AccountsManager({ accounts }: { accounts: AccountListItem[] }) {
  const [pending, start] = useTransition()

  const active = accounts.filter((a) => !a.archived_at)
  const archived = accounts.filter((a) => a.archived_at)
  const groups = groupByBank(active)

  const knownBanks = Array.from(new Set(groups.map((g) => g.bank))).sort((a, b) =>
    a.localeCompare(b),
  )

  function handleArchive(id: string) {
    start(async () => {
      try {
        await archiveAccount(id)
        toast.success("Conta arquivada.")
      } catch (error) {
        toast.error((error as Error).message)
      }
    })
  }

  return (
    <div className="space-y-6">
      <CreateAccountForm knownBanks={knownBanks} />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((group) => (
          <BankCard
            key={`${group.bank}${group.isFgts ? "::fgts" : ""}`}
            group={group}
            pending={pending}
            onArchive={handleArchive}
          />
        ))}
      </div>

      {archived.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted">Arquivadas</h2>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {archived.map((account) => (
              <li key={account.id} className="px-4 py-2 text-sm text-muted">
                {account.name} · {TYPE_LABELS[account.type]}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
