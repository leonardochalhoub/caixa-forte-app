"use client"

import { useTransition } from "react"
import { toast } from "@/components/ui/toast"
import { setAccountBalanceClassification } from "../actions"

export function ClassificationPicker({
  accountId,
  current,
  defaultGuess,
  disabled,
}: {
  accountId: string
  current: "circulante" | "nao_circulante" | null
  defaultGuess: "circulante" | "nao_circulante"
  disabled: boolean
}) {
  const [pending, start] = useTransition()
  const effective = current ?? defaultGuess

  function set(value: "circulante" | "nao_circulante" | null) {
    start(async () => {
      try {
        await setAccountBalanceClassification({
          id: accountId,
          classification: value,
        })
        toast.success("Classificação atualizada.")
      } catch (err) {
        toast.error((err as Error).message)
      }
    })
  }

  return (
    <div className="mt-1 flex items-center gap-1 text-[10px] uppercase tracking-wider">
      <span className="text-muted">Balanço:</span>
      <button
        type="button"
        disabled={disabled || pending}
        onClick={() =>
          set(
            effective === "circulante" && current !== null
              ? null
              : "circulante",
          )
        }
        className={`rounded-full border px-1.5 py-0.5 transition-colors ${
          effective === "circulante"
            ? "border-income/50 bg-income/10 text-income"
            : "border-border text-muted hover:text-strong"
        }`}
        title={
          current === null
            ? "Default por tipo — clique pra fixar como Circulante"
            : "Fixado como Circulante"
        }
      >
        Circ.
      </button>
      <button
        type="button"
        disabled={disabled || pending}
        onClick={() =>
          set(
            effective === "nao_circulante" && current !== null
              ? null
              : "nao_circulante",
          )
        }
        className={`rounded-full border px-1.5 py-0.5 transition-colors ${
          effective === "nao_circulante"
            ? "border-strong/50 bg-strong/10 text-strong"
            : "border-border text-muted hover:text-strong"
        }`}
        title={
          current === null
            ? "Default por tipo — clique pra fixar como Não Circulante"
            : "Fixado como Não Circulante"
        }
      >
        N/Circ.
      </button>
      {current !== null && (
        <button
          type="button"
          disabled={disabled || pending}
          onClick={() => set(null)}
          className="text-[9px] text-muted hover:text-expense"
          title="Voltar pro default do tipo"
        >
          ×
        </button>
      )}
    </div>
  )
}
