"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { NewTransactionForm } from "./NewTransactionForm"
import type { AccountType } from "@/lib/types"

type Account = { id: string; name: string; type: AccountType }
type Category = { id: string; name: string; is_income: boolean; parent_id: string | null }

export function QuickEntry({ accounts, categories }: { accounts: Account[]; categories: Category[] }) {
  const [open, setOpen] = useState(false)

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <Input
          placeholder='Em breve: escreva "25 ifood ontem" e pressione Enter'
          disabled
          className="cursor-not-allowed"
        />
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" />
              Nova transação
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova transação</DialogTitle>
            </DialogHeader>
            <NewTransactionForm
              accounts={accounts}
              categories={categories}
              onSaved={() => setOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>
      <p className="text-xs text-muted">
        A entrada por texto livre vem no M2 (parser Groq). Por enquanto, use o formulário manual.
      </p>
    </section>
  )
}
