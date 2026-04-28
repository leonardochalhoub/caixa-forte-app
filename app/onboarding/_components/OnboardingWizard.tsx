"use client"

import { useEffect, useState, useTransition } from "react"
import { Sparkles, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "@/components/ui/toast"
import type { AccountType } from "@/lib/types"
import {
  createAccountAction,
  deleteAccountAction,
  finishOnboardingAction,
  generateCategoriesAction,
} from "../actions"

type Account = { id: string; name: string; type: AccountType }

const TYPE_LABELS: Record<AccountType, string> = {
  checking: "Conta Corrente",
  credit: "Cartão de crédito",
  cash: "Dinheiro",
  wallet: "Carteira",
  savings: "Renda Fixa",
  investment: "Renda Variável",
  poupanca: "Poupança",
  crypto: "Cripto",
  fgts: "FGTS",
  ticket: "Vale-benefício",
}

const TYPES: AccountType[] = [
  "checking",
  "ticket",
  "savings",
  "poupanca",
  "investment",
  "crypto",
  "fgts",
  "credit",
  "cash",
  "wallet",
]

const DESCRIPTION_PLACEHOLDER = `Ex: Moro sozinho em SP, trabalho remoto em tech, faço academia 3x/semana, peço ifood umas 2x/semana, gosto de ir em restaurante no fim de semana, tenho um gato, uso Uber quase todo dia...`

type Step = 0 | 1 | 2 | 3

function descKey(userId: string) {
  return `cfx:onboarding:description:${userId}`
}

export function OnboardingWizard({
  userId,
  displayName: initialName,
  existingAccounts,
  hasCategories,
  hasGroqKey,
  initialStep,
}: {
  userId: string
  displayName: string
  existingAccounts: Account[]
  hasCategories: boolean
  hasGroqKey: boolean
  initialStep: Step
}) {
  const [step, setStep] = useState<Step>(initialStep)
  const [displayName, setDisplayName] = useState(initialName)
  const [accounts, setAccounts] = useState<Account[]>(existingAccounts)
  const [newAccountName, setNewAccountName] = useState("Nubank")
  const [newAccountType, setNewAccountType] = useState<AccountType>("checking")
  const [description, setDescription] = useState("")
  const [categoriesReady, setCategoriesReady] = useState(hasCategories)
  const [generationSummary, setGenerationSummary] = useState<string | null>(null)
  const [pending, start] = useTransition()

  useEffect(() => {
    if (typeof window === "undefined") return
    const saved = window.localStorage.getItem(descKey(userId))
    if (saved) setDescription(saved)
  }, [userId])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (description) window.localStorage.setItem(descKey(userId), description)
    else window.localStorage.removeItem(descKey(userId))
  }, [description, userId])

  const canAdvanceAccounts = accounts.length >= 1

  function handleCreateAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    start(async () => {
      try {
        const created = await createAccountAction({
          name: newAccountName.trim(),
          type: newAccountType,
        })
        setAccounts((prev) => [...prev, created])
        setNewAccountName("")
        setNewAccountType("checking")
        toast.success(`${created.name} adicionada.`)
      } catch (error) {
        toast.error((error as Error).message)
      }
    })
  }

  function handleDeleteAccount(id: string) {
    start(async () => {
      try {
        await deleteAccountAction(id)
        setAccounts((prev) => prev.filter((a) => a.id !== id))
      } catch (error) {
        toast.error((error as Error).message)
      }
    })
  }

  function handleGenerate() {
    start(async () => {
      try {
        const result = await generateCategoriesAction({ description })
        if (result.created === 0) {
          setGenerationSummary("Você já tinha categorias — mantivemos as existentes.")
        } else {
          const via = result.source === "groq" ? "via Groq" : "com o modelo padrão BR (sem Groq)"
          setGenerationSummary(
            `${result.created} categorias criadas ${via}. Você pode editar em /app/categorias depois.`,
          )
        }
        setCategoriesReady(true)
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(descKey(userId))
        }
      } catch (error) {
        toast.error((error as Error).message)
      }
    })
  }

  function handleFinish() {
    start(async () => {
      try {
        await finishOnboardingAction({ displayName })
      } catch (error) {
        toast.error((error as Error).message)
      }
    })
  }

  const resumed = initialStep > 0

  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle className="text-canvas text-strong">
          {resumed ? "Continuando onde você parou" : "Bem-vindo ao Caixa Forte"}
        </CardTitle>
        <CardDescription>Passo {step + 1} de 4</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {step === 0 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Como você se chama?</Label>
              <Input
                id="name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Leonardo"
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setStep(1)} disabled={!displayName.trim()}>
                Próximo
              </Button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-strong">Suas contas</h3>
              <p className="text-sm text-muted">
                Adicione onde seu dinheiro vive. É obrigatório pelo menos uma conta.
              </p>
            </div>

            <ul className="space-y-2">
              {accounts.map((account) => (
                <li
                  key={account.id}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                >
                  <span>
                    <span className="font-medium text-strong">{account.name}</span>{" "}
                    <span className="text-muted">· {TYPE_LABELS[account.type]}</span>
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted hover:bg-subtle hover:text-expense"
                    onClick={() => handleDeleteAccount(account.id)}
                    disabled={pending}
                    aria-label={`Remover ${account.name}`}
                    title="Remover"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
              {accounts.length === 0 && (
                <li className="rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-muted">
                  Nenhuma conta ainda — adicione pelo menos uma abaixo.
                </li>
              )}
            </ul>

            <form onSubmit={handleCreateAccount} className="grid grid-cols-[1fr_180px_auto] gap-2">
              <Input
                value={newAccountName}
                onChange={(event) => setNewAccountName(event.target.value)}
                placeholder="Nome (ex: Nubank)"
                required
              />
              <Select value={newAccountType} onValueChange={(v) => setNewAccountType(v as AccountType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="submit" disabled={pending || !newAccountName.trim()}>
                Adicionar
              </Button>
            </form>

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(0)}>
                Voltar
              </Button>
              <Button onClick={() => setStep(2)} disabled={!canAdvanceAccounts}>
                Próximo
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-strong">Me conte sobre você</h3>
              <p className="text-sm text-muted">
                Fale sobre sua rotina, o que gasta com frequência, hobbies, fins de semana, pets, o
                que comer… Vou usar isso para gerar categorias que fazem sentido pra você.
                {!hasGroqKey && (
                  <span className="mt-1 block text-xs text-muted">
                    (Sem <span className="font-mono">GROQ_API_KEY</span> configurada — vamos usar as
                    categorias padrão brasileiras por enquanto.)
                  </span>
                )}
              </p>
            </div>

            {hasCategories ? (
              <div className="space-y-3 rounded-md border border-border bg-subtle p-4 text-sm">
                <p className="text-body">
                  Você já tem categorias cadastradas de antes. Vamos manter essas para não perder
                  seu histórico.
                </p>
                <p className="text-xs text-muted">
                  Se quiser regenerar depois, dá pra fazer em{" "}
                  <span className="font-mono text-strong">/app/categorias</span> (vem num próximo
                  milestone).
                </p>
              </div>
            ) : categoriesReady ? (
              <div className="rounded-md border border-border bg-subtle p-4 text-sm text-body">
                {generationSummary}
              </div>
            ) : (
              <div className="space-y-3">
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder={DESCRIPTION_PLACEHOLDER}
                  className="min-h-[180px] w-full rounded-md border border-border bg-canvas px-3 py-2 text-sm text-strong placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-strong focus-visible:ring-offset-2"
                  maxLength={4000}
                  disabled={pending}
                />
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>{description.trim().length} / 4000</span>
                  <span>
                    {description.trim().length === 0
                      ? "Deixar em branco = categorias padrão"
                      : "Vai ser enviado pro Groq"}
                  </span>
                </div>
              </div>
            )}

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(1)}>
                Voltar
              </Button>
              {!categoriesReady && !hasCategories ? (
                <Button onClick={handleGenerate} disabled={pending}>
                  <Sparkles className="h-4 w-4" />
                  {pending ? "Gerando..." : "Gerar minhas categorias"}
                </Button>
              ) : (
                <Button onClick={() => setStep(3)} disabled={pending}>
                  Próximo
                </Button>
              )}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-strong">Tudo pronto</h3>
              <p className="text-sm text-muted">
                Seu espaço no Caixa Forte está configurado. Vamos abrir o dashboard?
              </p>
            </div>

            <div className="rounded-md border border-border bg-subtle p-4 text-sm text-body">
              <p>
                <span className="text-muted">Nome:</span> <span className="text-strong">{displayName}</span>
              </p>
              <p>
                <span className="text-muted">Contas:</span>{" "}
                <span className="text-strong">{accounts.map((a) => a.name).join(", ")}</span>
              </p>
              <p>
                <span className="text-muted">Categorias:</span>{" "}
                <span className="text-strong">Prontas</span>
              </p>
            </div>

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(2)}>
                Voltar
              </Button>
              <Button onClick={handleFinish} disabled={pending}>
                {pending ? "Finalizando..." : "Abrir Caixa Forte"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
