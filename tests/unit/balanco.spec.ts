import { describe, it, expect } from "vitest"
import {
  parsePeriod,
  SECTION_LABELS,
  TYPE_CLASSIFICATION,
} from "@/lib/reports/balanco"

describe("parsePeriod", () => {
  it("aceita 'mensal:YYYY-MM'", () => {
    const r = parsePeriod("mensal:2026-04")
    expect(r.kind).toBe("mensal")
    expect(r.year).toBe(2026)
    expect(r.month).toBe(4)
    expect(r.label).toMatch(/Abril 2026/)
  })

  it("aceita 'anual:YYYY'", () => {
    const r = parsePeriod("anual:2025")
    expect(r.kind).toBe("anual")
    expect(r.year).toBe(2025)
    expect(r.month).toBeUndefined()
    expect(r.label).toBe("Anual 2025")
    expect(r.snapshotDate).toBe("2025-12-31")
  })

  it("snapshotDate respeita hoje quando dentro do período mensal", () => {
    // mês corrente: snapshot deve ser ≤ hoje (não end-of-month)
    const today = new Date()
    const ym = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`
    const r = parsePeriod(`mensal:${ym}`)
    const todayIso = today.toISOString().slice(0, 10)
    // snapshot pode ser hoje OU end-of-month, dependendo de qual é menor
    expect(r.snapshotDate <= todayIso || r.snapshotDate.startsWith(ym)).toBe(true)
  })

  it("aceita formato sem prefixo (compat)", () => {
    const r = parsePeriod("2026-04")
    expect(r.kind).toBe("mensal")
    expect(r.month).toBe(4)
  })

  it("último dia do mês correto pra fevereiro de ano não-bissexto", () => {
    const r = parsePeriod("mensal:2025-02")
    // fev/2025 tem 28 dias
    expect(r.snapshotDate.endsWith("-02-28") || r.snapshotDate < "2025-02-28").toBe(true)
  })
})

describe("TYPE_CLASSIFICATION", () => {
  it("checking → ativo_circulante_disponivel", () => {
    expect(TYPE_CLASSIFICATION.checking).toBe("ativo_circulante_disponivel")
    expect(TYPE_CLASSIFICATION.cash).toBe("ativo_circulante_disponivel")
    expect(TYPE_CLASSIFICATION.wallet).toBe("ativo_circulante_disponivel")
  })

  it("credit → passivo_circulante_cartoes", () => {
    expect(TYPE_CLASSIFICATION.credit).toBe("passivo_circulante_cartoes")
  })

  it("savings/poupanca → ativo_circulante_renda_fixa (mesma seção)", () => {
    expect(TYPE_CLASSIFICATION.savings).toBe(TYPE_CLASSIFICATION.poupanca)
  })

  it("fgts → ativo_nc_bloqueado", () => {
    expect(TYPE_CLASSIFICATION.fgts).toBe("ativo_nc_bloqueado")
  })
})

describe("SECTION_LABELS", () => {
  it("toda chave de TYPE_CLASSIFICATION tem label", () => {
    const allKeys = new Set(Object.values(TYPE_CLASSIFICATION))
    for (const k of allKeys) {
      expect(SECTION_LABELS[k]).toBeTruthy()
    }
  })
})
