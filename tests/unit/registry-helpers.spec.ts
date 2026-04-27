import { describe, expect, it } from "vitest"
import {
  findKindIndexByKey,
  formatCentsAsBRLInput,
  REGISTRY_KINDS,
  REGISTRY_SECTIONS,
} from "@/lib/balanco/registry-helpers"

describe("registry-helpers", () => {
  describe("REGISTRY_KINDS", () => {
    it("expõe os 7 templates contábeis esperados", () => {
      expect(REGISTRY_KINDS).toHaveLength(7)
      const keys = REGISTRY_KINDS.map((k) => k.key)
      expect(keys).toEqual([
        "compra_vista",
        "compra_financiada",
        "aporte",
        "retirada",
        "valorizacao",
        "pagamento_divida",
        "emprestimo",
      ])
    })
    it("cada kind tem campos obrigatórios não vazios", () => {
      for (const k of REGISTRY_KINDS) {
        expect(k.label.length).toBeGreaterThan(0)
        expect(k.hint.length).toBeGreaterThan(0)
        expect(k.debitDefault.length).toBeGreaterThan(0)
        expect(k.creditDefault.length).toBeGreaterThan(0)
        expect(k.debitPlaceholder.length).toBeGreaterThan(0)
        expect(k.creditPlaceholder.length).toBeGreaterThan(0)
      }
    })
  })

  describe("REGISTRY_SECTIONS", () => {
    it("section defaults dos kinds existem na lista de seções", () => {
      const sectionValues = new Set(REGISTRY_SECTIONS.map((s) => s.value))
      for (const k of REGISTRY_KINDS) {
        expect(sectionValues.has(k.debitDefault)).toBe(true)
        expect(sectionValues.has(k.creditDefault)).toBe(true)
      }
    })
  })

  describe("formatCentsAsBRLInput", () => {
    it("formata cents como string editável BRL", () => {
      expect(formatCentsAsBRLInput(0)).toBe("0,00")
      expect(formatCentsAsBRLInput(100)).toBe("1,00")
      expect(formatCentsAsBRLInput(1840)).toBe("18,40")
      expect(formatCentsAsBRLInput(123456)).toBe("1.234,56")
      expect(formatCentsAsBRLInput(1_000_000)).toBe("10.000,00")
    })
  })

  describe("findKindIndexByKey", () => {
    it("retorna índice quando key existe", () => {
      expect(findKindIndexByKey(REGISTRY_KINDS, "compra_vista")).toBe(0)
      expect(findKindIndexByKey(REGISTRY_KINDS, "emprestimo")).toBe(6)
    })
    it("retorna -1 quando key não existe", () => {
      expect(findKindIndexByKey(REGISTRY_KINDS, "inexistente")).toBe(-1)
    })
  })
})
