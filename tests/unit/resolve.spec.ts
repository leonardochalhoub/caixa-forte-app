import { describe, it, expect } from "vitest"
import { resolveAccountId, resolveCategoryId } from "@/lib/parser/resolve"

const ACCOUNTS = [
  { id: "00000000-0000-0000-0000-000000000001", name: "Nubank Conta" },
  { id: "00000000-0000-0000-0000-000000000002", name: "Nubank Cartão" },
  { id: "00000000-0000-0000-0000-000000000003", name: "Caixa Econômica Federal" },
  { id: "00000000-0000-0000-0000-000000000004", name: "Caixa Econômica Federal Cartão" },
  { id: "00000000-0000-0000-0000-000000000005", name: "Mercado Pago" },
]

describe("resolveAccountId", () => {
  it("UUID exato → match direto", () => {
    expect(resolveAccountId("00000000-0000-0000-0000-000000000003", ACCOUNTS)).toBe(
      "00000000-0000-0000-0000-000000000003",
    )
  })

  it("UUID em case diferente → match", () => {
    expect(resolveAccountId("00000000-0000-0000-0000-000000000003".toUpperCase(), ACCOUNTS)).toBe(
      "00000000-0000-0000-0000-000000000003",
    )
  })

  it("UUID válido mas inexistente → null", () => {
    expect(resolveAccountId("ffffffff-ffff-ffff-ffff-ffffffffffff", ACCOUNTS)).toBeNull()
  })

  it("hint substring case-insensitive → fuzzy match", () => {
    expect(resolveAccountId("nubank conta", ACCOUNTS)).toBe(
      "00000000-0000-0000-0000-000000000001",
    )
  })

  it("hint com acento → match (normalize)", () => {
    expect(resolveAccountId("Caixa Econômica", ACCOUNTS)).toBeTruthy()
  })

  it("hint curto (<4 chars) → null pra evitar falso-positivo", () => {
    expect(resolveAccountId("nu", ACCOUNTS)).toBeNull()
    expect(resolveAccountId("xp", ACCOUNTS)).toBeNull()
  })

  it("hint 'mercado pago' não casa com 'caixa cartão' (regression)", () => {
    // Bug histórico: account_hint matching frouxo casava merchants
    // genéricos ("Mercado Pago") com o primeiro account com substring
    // parecida (Caixa Federal Cartão). Reverso (needle ⊂ name) só
    // funciona se needle compartilha substring real.
    expect(resolveAccountId("mercado pago", ACCOUNTS)).toBe(
      "00000000-0000-0000-0000-000000000005",
    )
  })

  it("hint vazio/null → null", () => {
    expect(resolveAccountId(null, ACCOUNTS)).toBeNull()
    expect(resolveAccountId("", ACCOUNTS)).toBeNull()
  })

  it("hint substring de um account name → fuzzy match", () => {
    // "Caixa" sozinho casa com a primeira conta que contém "caixa"
    // (substring direto). Esse é um false-positive aceito até
    // adicionarmos token-level matching.
    expect(resolveAccountId("caixa", ACCOUNTS)).toBeTruthy()
  })

  it.skip("TODO: 'Caixa Federal' deveria casar 'Caixa Econômica Federal'", () => {
    // Limitação atual: includes() exige substring contígua.
    // Pra resolver: implementar token-level intersection.
    expect(resolveAccountId("Caixa Federal", ACCOUNTS)).toBeTruthy()
  })
})

describe("resolveCategoryId", () => {
  const CATS = [
    {
      id: "c1",
      name: "Alimentação",
      parent_id: null,
      is_income: false,
    },
    {
      id: "c1-1",
      name: "Restaurantes",
      parent_id: "c1",
      is_income: false,
    },
    {
      id: "c1-2",
      name: "Mercado",
      parent_id: "c1",
      is_income: false,
    },
    {
      id: "c2",
      name: "Salário",
      parent_id: null,
      is_income: true,
    },
  ]

  it("match exato no parent (case-insensitive, sem acento)", () => {
    expect(
      resolveCategoryId(
        { category_name: "alimentacao", subcategory_name: null, type: "expense" },
        CATS,
      ),
    ).toBe("c1")
  })

  it("subcategoria casada → retorna ID da child", () => {
    expect(
      resolveCategoryId(
        { category_name: "Alimentação", subcategory_name: "Restaurantes", type: "expense" },
        CATS,
      ),
    ).toBe("c1-1")
  })

  it("subcategoria não casada → fallback pro parent", () => {
    expect(
      resolveCategoryId(
        { category_name: "Alimentação", subcategory_name: "Pizza", type: "expense" },
        CATS,
      ),
    ).toBe("c1")
  })

  it("nome desconhecido → null", () => {
    expect(
      resolveCategoryId(
        { category_name: "Inexistente", subcategory_name: null, type: "expense" },
        CATS,
      ),
    ).toBeNull()
  })
})
