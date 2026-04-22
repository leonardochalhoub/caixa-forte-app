import { describe, expect, it } from "vitest"
import {
  currentMonthRange,
  formatPtBrDate,
  formatPtBrDateShort,
  last6MonthsStart,
  resolveRelativeDate,
  todayIsoDate,
} from "@/lib/time"

const fixedNow = new Date("2026-04-22T15:30:00-03:00")

describe("time helpers", () => {
  describe("resolveRelativeDate", () => {
    it("resolves hoje/ontem/anteontem in SP timezone", () => {
      expect(resolveRelativeDate("hoje", fixedNow)).toBe("2026-04-22")
      expect(resolveRelativeDate("ontem", fixedNow)).toBe("2026-04-21")
      expect(resolveRelativeDate("anteontem", fixedNow)).toBe("2026-04-20")
      expect(resolveRelativeDate("amanhã", fixedNow)).toBe("2026-04-23")
    })

    it('resolves "dia N" within current month', () => {
      expect(resolveRelativeDate("dia 5", fixedNow)).toBe("2026-04-05")
      expect(resolveRelativeDate("dia 15", fixedNow)).toBe("2026-04-15")
    })

    it("accepts ISO and BR literals", () => {
      expect(resolveRelativeDate("2026-01-10", fixedNow)).toBe("2026-01-10")
      expect(resolveRelativeDate("10/01", fixedNow)).toBe("2026-01-10")
      expect(resolveRelativeDate("10/01/2025", fixedNow)).toBe("2025-01-10")
    })

    it("returns null for gibberish", () => {
      expect(resolveRelativeDate("quarta-feira", fixedNow)).toBeNull()
      expect(resolveRelativeDate("semana passada", fixedNow)).toBeNull()
    })
  })

  describe("currentMonthRange", () => {
    it("returns first to last day of the month", () => {
      const range = currentMonthRange(fixedNow)
      expect(range.start).toBe("2026-04-01")
      expect(range.end).toBe("2026-04-30")
    })
  })

  describe("last6MonthsStart", () => {
    it("returns start of month 5 months back", () => {
      expect(last6MonthsStart(fixedNow)).toBe("2025-11-01")
    })
  })

  describe("todayIsoDate", () => {
    it("returns YYYY-MM-DD in SP timezone", () => {
      expect(todayIsoDate(fixedNow)).toBe("2026-04-22")
    })
  })

  describe("formatting", () => {
    it("formats pt-BR dates", () => {
      expect(formatPtBrDate("2026-04-22")).toBe("22/04/2026")
      expect(formatPtBrDateShort("2026-04-22")).toBe("22/04")
    })
  })
})
