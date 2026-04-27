import { describe, it, expect } from "vitest"
import {
  bankKeyOfCard,
  chargeInvoiceMonth,
  merchantInvoiceMonth,
  normalizeMerchant,
  parseInvoiceMonth,
} from "@/lib/invoices/bucket"

describe("normalizeMerchant", () => {
  it("strip acento + lowercase", () => {
    expect(normalizeMerchant("Cartão MERCADO Pagô")).toBe("cartao mercado pago")
  })
  it("aceita null/undefined", () => {
    expect(normalizeMerchant(null)).toBe("")
    expect(normalizeMerchant(undefined)).toBe("")
  })
  it("trim espaços externos", () => {
    expect(normalizeMerchant("  Foo  ")).toBe("foo")
  })
})

describe("bankKeyOfCard", () => {
  it("primeira palavra antes de 'cartão'", () => {
    expect(bankKeyOfCard("Nubank Cartão Platinum")).toBe("nubank")
    expect(bankKeyOfCard("Caixa Econômica Federal Cartão")).toBe("caixa")
    expect(bankKeyOfCard("Inter Cartão")).toBe("inter")
  })
  it("acentos sumiram", () => {
    expect(bankKeyOfCard("Caixa Econômica Cartão")).not.toContain("ô")
    expect(bankKeyOfCard("São Carlos Cartão")).toBe("sao")
  })
  it("se não tem 'cartão' usa nome inteiro stripped", () => {
    expect(bankKeyOfCard("XP")).toBe("xp")
  })
})

describe("chargeInvoiceMonth", () => {
  it("dia <= closing_day → mês corrente", () => {
    expect(chargeInvoiceMonth("2026-04-15", 27)).toBe("2026-04")
    expect(chargeInvoiceMonth("2026-04-27", 27)).toBe("2026-04") // boundary inclusive
    expect(chargeInvoiceMonth("2026-04-01", 27)).toBe("2026-04")
  })
  it("dia > closing_day → próximo mês", () => {
    expect(chargeInvoiceMonth("2026-04-28", 27)).toBe("2026-05")
    expect(chargeInvoiceMonth("2026-04-30", 27)).toBe("2026-05")
  })
  it("rollover de dezembro → janeiro próximo ano", () => {
    expect(chargeInvoiceMonth("2026-12-30", 20)).toBe("2027-01")
  })
  it("closing_day null → mês-calendário (sem cutoff)", () => {
    expect(chargeInvoiceMonth("2026-04-30", null)).toBe("2026-04")
  })
  it("closing_day=28 (limite seguro) — cobre todos os meses", () => {
    expect(chargeInvoiceMonth("2026-02-28", 28)).toBe("2026-02") // fev tem 28
    expect(chargeInvoiceMonth("2026-04-28", 28)).toBe("2026-04")
  })
})

describe("merchantInvoiceMonth", () => {
  it("extrai mês+ano de 'Banco Cartão Mês Ano'", () => {
    expect(merchantInvoiceMonth("Nubank Cartão Abril 2026", "2026-04-27")).toBe("2026-04")
    expect(merchantInvoiceMonth("Caixa Cartão Janeiro 2025", "2025-01-15")).toBe("2025-01")
  })
  it("extrai 'Pagamento fatura · Maio 2026'", () => {
    expect(merchantInvoiceMonth("Pagamento fatura · Maio 2026", "2026-04-27")).toBe("2026-05")
  })
  it("aceita acento/maiúscula", () => {
    expect(merchantInvoiceMonth("Nubank Cartão MARÇO 2026", "2026-03-15")).toBe("2026-03")
  })
  it("sem ano → fallback occurred_on", () => {
    expect(merchantInvoiceMonth("Nubank Cartão", "2026-04-15")).toBe("2026-04")
  })
  it("sem mês → fallback occurred_on", () => {
    expect(merchantInvoiceMonth("Pagamento qualquer 2026", "2026-04-15")).toBe("2026-04")
  })
  it("merchant null → fallback", () => {
    expect(merchantInvoiceMonth(null, "2026-04-15")).toBe("2026-04")
  })
})

describe("parseInvoiceMonth", () => {
  it("parseia 'Nubank Cartão · Abril 2026'", () => {
    const r = parseInvoiceMonth("Nubank Cartão · Abril 2026")
    expect(r).toEqual({
      monthName: "abril",
      year: "2026",
      invoiceYM: "2026-04",
    })
  })
  it("parseia formato sem dot", () => {
    const r = parseInvoiceMonth("Caixa Cartão Janeiro 2025")
    expect(r).toEqual({
      monthName: "janeiro",
      year: "2025",
      invoiceYM: "2025-01",
    })
  })
  it("retorna null se não tem ano", () => {
    expect(parseInvoiceMonth("Nubank Cartão Abril")).toBeNull()
  })
  it("retorna null se não tem mês", () => {
    expect(parseInvoiceMonth("Cartão 2026")).toBeNull()
  })
  it("aceita acento (Março → marco)", () => {
    const r = parseInvoiceMonth("Nubank Cartão Março 2026")
    expect(r?.monthName).toBe("marco")
    expect(r?.invoiceYM).toBe("2026-03")
  })
})
