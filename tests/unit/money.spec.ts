import { describe, expect, it } from "vitest"
import { formatBRL, parseBRLToCents, toCents, toReais } from "@/lib/money"

describe("money helpers", () => {
  describe("toCents", () => {
    it("converts whole reais", () => {
      expect(toCents(20)).toBe(2000)
      expect(toCents(1)).toBe(100)
    })
    it("converts decimals without float drift", () => {
      expect(toCents(18.4)).toBe(1840)
      expect(toCents(99.9)).toBe(9990)
      expect(toCents(52.9)).toBe(5290)
    })
    it("rejects non-finite", () => {
      expect(() => toCents(Number.NaN)).toThrow()
      expect(() => toCents(Infinity)).toThrow()
    })
  })

  describe("toReais", () => {
    it("accepts number or bigint", () => {
      expect(toReais(2000)).toBe(20)
      expect(toReais(1840n)).toBe(18.4)
    })
  })

  describe("formatBRL", () => {
    it("formats pt-BR currency", () => {
      expect(formatBRL(2000)).toMatch(/R\$\s?20,00/)
      expect(formatBRL(123456)).toMatch(/R\$\s?1\.234,56/)
      expect(formatBRL(0)).toMatch(/R\$\s?0,00/)
    })
    it("handles negatives", () => {
      expect(formatBRL(-500)).toMatch(/-R\$\s?5,00/)
    })
  })

  describe("parseBRLToCents", () => {
    it("parses Brazilian formats", () => {
      expect(parseBRLToCents("20")).toBe(2000)
      expect(parseBRLToCents("20,00")).toBe(2000)
      expect(parseBRLToCents("18,40")).toBe(1840)
      expect(parseBRLToCents("1.234,56")).toBe(123456)
      expect(parseBRLToCents("R$ 99,90")).toBe(9990)
      expect(parseBRLToCents("r$99")).toBe(9900)
    })
    it("parses US-style dot decimals (fallback)", () => {
      expect(parseBRLToCents("18.40")).toBe(1840)
    })
    it("rejects nonsense", () => {
      expect(parseBRLToCents("abc")).toBeNull()
      expect(parseBRLToCents("")).toBeNull()
      expect(parseBRLToCents("1,23,45")).toBeNull()
    })
  })
})
