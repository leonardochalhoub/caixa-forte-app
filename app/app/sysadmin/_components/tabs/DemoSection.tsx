"use client"

import { SeedDemoButton } from "../SeedDemoButton"

export function DemoSection() {
  return (
    <section className="rounded-xl border border-border bg-subtle/40 p-4">
      <div className="mb-3 flex flex-col gap-1">
        <p className="text-sm font-medium text-strong">Conta de demonstração (Larissa)</p>
        <p className="text-xs text-muted">
          Recria a Larissa do zero: auth user + dados do período escolhido
          gerados via Groq. Após o seed, o botão "Ver conta de exemplo" na
          landing funciona. Qualquer admin pode rodar.
        </p>
      </div>
      <SeedDemoButton />
    </section>
  )
}
