// Helpers puros pro RegistryForm do balanço (partida dobrada).
// Templates espelham REGISTRY_KINDS do server; seções espelham
// taxonomia contábil em lib/reports/balanco-types.ts.

export type RegistryKind = {
  key: string
  label: string
  hint: string
  debitDefault: string
  debitPlaceholder: string
  creditDefault: string
  creditPlaceholder: string
}

export const REGISTRY_KINDS: readonly RegistryKind[] = [
  {
    key: "compra_vista",
    label: "Compra à vista",
    hint: "Comprou um bem pagando com dinheiro da conta (ex: carro à vista).",
    debitDefault: "ativo_nc_imobilizado",
    debitPlaceholder: "O que você comprou",
    creditDefault: "ativo_circulante_disponivel",
    creditPlaceholder: "Conta de onde saiu",
  },
  {
    key: "compra_financiada",
    label: "Compra financiada",
    hint: "Comprou um bem com financiamento/empréstimo.",
    debitDefault: "ativo_nc_imobilizado",
    debitPlaceholder: "Bem comprado",
    creditDefault: "passivo_nc_financiamentos",
    creditPlaceholder: "Nome do financiamento",
  },
  {
    key: "aporte",
    label: "Aporte / Capital inicial",
    hint: "Dinheiro que entrou de fora do sistema (presente, herança, capital).",
    debitDefault: "ativo_circulante_disponivel",
    debitPlaceholder: "Conta onde entrou",
    creditDefault: "patrimonio_liquido",
    creditPlaceholder: "Descrição do aporte",
  },
  {
    key: "retirada",
    label: "Retirada / Distribuição",
    hint: "Tirou dinheiro do patrimônio (retirada de lucros pra fora).",
    debitDefault: "patrimonio_liquido",
    debitPlaceholder: "Descrição da retirada",
    creditDefault: "ativo_circulante_disponivel",
    creditPlaceholder: "Conta de onde saiu",
  },
  {
    key: "valorizacao",
    label: "Valorização / Desvalorização",
    hint: "Reavaliação de um ativo (imóvel subiu/caiu, FIPE atualizou).",
    debitDefault: "ativo_nc_imobilizado",
    debitPlaceholder: "Qual bem",
    creditDefault: "patrimonio_liquido",
    creditPlaceholder: "Motivo (ex: FIPE)",
  },
  {
    key: "pagamento_divida",
    label: "Pagamento de dívida",
    hint: "Pagou parcela ou quitou dívida com dinheiro da conta.",
    debitDefault: "passivo_nc_financiamentos",
    debitPlaceholder: "Qual dívida",
    creditDefault: "ativo_circulante_disponivel",
    creditPlaceholder: "Conta de onde saiu",
  },
  {
    key: "emprestimo",
    label: "Empréstimo tomado",
    hint: "Pegou empréstimo — dinheiro cai na conta, cria dívida.",
    debitDefault: "ativo_circulante_disponivel",
    debitPlaceholder: "Conta que recebeu",
    creditDefault: "passivo_nc_financiamentos",
    creditPlaceholder: "Credor",
  },
] as const

export type SectionOption = { value: string; label: string }

export const REGISTRY_SECTIONS: readonly SectionOption[] = [
  { value: "ativo_circulante_disponivel", label: "Ativo Circ. · Disponibilidades" },
  { value: "ativo_circulante_renda_fixa", label: "Ativo Circ. · Renda Fixa" },
  { value: "ativo_circulante_renda_variavel", label: "Ativo Circ. · Renda Variável" },
  { value: "ativo_circulante_cripto", label: "Ativo Circ. · Cripto" },
  { value: "ativo_circulante_outros", label: "Ativo Circ. · Outros" },
  { value: "ativo_nc_bloqueado", label: "Ativo NC · Bloqueado (FGTS)" },
  { value: "ativo_nc_imobilizado", label: "Ativo NC · Imobilizado" },
  { value: "ativo_nc_intangivel", label: "Ativo NC · Intangível" },
  { value: "passivo_circulante_cartoes", label: "Passivo Circ. · Cartões" },
  { value: "passivo_circulante_outros", label: "Passivo Circ. · Outros" },
  { value: "passivo_nc_financiamentos", label: "Passivo NC · Financiamentos" },
  { value: "patrimonio_liquido", label: "Patrimônio Líquido" },
] as const

// Formata cents como string editável BRL ("1234,56" → "1.234,56").
// Espelha a lógica que estava inline no RegistryForm (regex de milhares).
export function formatCentsAsBRLInput(cents: number): string {
  return (cents / 100)
    .toFixed(2)
    .replace(".", ",")
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".")
}

// Acha o índice de um kind dado sua key. -1 se não achar.
export function findKindIndexByKey(
  kinds: readonly RegistryKind[],
  key: string,
): number {
  return kinds.findIndex((k) => k.key === key)
}
