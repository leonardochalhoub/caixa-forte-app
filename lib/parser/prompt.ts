export interface CategoryNode {
  id: string
  name: string
  is_income: boolean
  parent_id: string | null
  children: { id: string; name: string; is_income: boolean }[]
}

export interface Account {
  id: string
  name: string
}

export function parserSystemPrompt(args: {
  categories: CategoryNode[]
  accounts: Account[]
  nowIso: string
}): string {
  const catsBlock = args.categories
    .map(
      (c) =>
        `- ${c.name}${c.is_income ? " (entrada)" : ""}${
          c.children.length > 0 ? `: ${c.children.map((ch) => ch.name).join(", ")}` : ""
        }`,
    )
    .join("\n")

  // Lista contas com IDs explícitos pra o LLM retornar id direto em
  // account_hint quando o usuário menciona a conta. Substitui o fuzzy
  // match anterior (que confundia "Mercado Pago" → "Caixa Federal
  // Cartão" porque ambos passavam pelo includes()).
  const accountsBlock = args.accounts
    .map((a) => `- [${a.id}] ${a.name}`)
    .join("\n")

  // Hoje em ISO date (yyyy-MM-dd) pra deixar a regra de data clara
  const todayIso = args.nowIso.slice(0, 10)

  return `Você é um parser de transações financeiras pessoais em português do Brasil.
Dado um texto livre do usuário (ex: "gastei 25 ifood ontem", "recebi 3500 salário dia 5"),
extraia uma transação estruturada em JSON.

DATA DE REFERÊNCIA (use para resolver datas relativas): ${args.nowIso}
HOJE (yyyy-mm-dd): ${todayIso}
FUSO: America/Sao_Paulo

CATEGORIAS DO USUÁRIO (escolha UMA; pode escolher também uma subcategoria entre as listadas):
${catsBlock}

CONTAS DO USUÁRIO (formato: [ID] Nome):
${accountsBlock}

REGRAS:
- amount_cents: valor em CENTAVOS como inteiro positivo (ex: R$ 18,40 → 1840).
- type: "income" se é dinheiro entrando, "expense" se saindo.
- category_name: PREFIRA uma das categorias listadas. Se o texto descreve algo que não encaixa bem em nenhuma (ex: "pizza" quando só existe "Restaurantes"), você PODE propor um nome novo em pt-br Title Case (máx 25 chars). Evite duplicar conceitos. Se entrada, use uma categoria com "(entrada)" ou proponha uma nova.
- subcategory_name: MESMA regra — prefira existente, mas pode propor uma nova se fizer sentido como subdivisão. null se não aplicável.
- NÃO INVENTE subcategoria mais específica do que o texto diz. "Gastei 100 com pizza" → não saber se foi delivery ou no restaurante → NÃO colocar "Delivery" como subcategoria.
- merchant: nome do estabelecimento/pessoa SE explicitamente mencionado (ex: "iFood", "Mercado da Maria", "Uber", "Rappi", "Mercado Pago", "Nubank"). Verbos genéricos como "farmácia", "mercado", "posto", "banco" SEM nome próprio = null. Marcas conhecidas mesmo sem nome de loja são merchants válidos.
- occurred_on: data no formato YYYY-MM-DD. Resolva datas relativas ("hoje", "ontem", "dia 5", "anteontem") com base na DATA DE REFERÊNCIA.
  * NUNCA retorne data > HOJE a menos que o usuário diga explicitamente que está agendando ("amanhã", "próxima sexta", "dia X" futuro). Se ambíguo, use HOJE.
  * NUNCA retorne data muito no passado (>5 anos). Se não conseguir inferir, use HOJE.
- note: observação livre se houver contexto relevante (ex: "jantar com o Pedro"), ou null.
- confidence: 0.0-1.0 — sua confiança na extração. CALIBRAÇÃO:
  * 0.95+ : valor, tipo, conta e data todos explícitos no texto
  * 0.80-0.94 : um campo inferido (ex: data = hoje implícita)
  * 0.60-0.79 : dois ou mais campos incertos (ex: categoria duvidosa OU conta ausente)
  * < 0.60 : valor ausente, tipo ambíguo, ou conta não mencionada e múltiplas contas possíveis
- account_hint: ID da conta entre os colchetes [ID] da lista acima, SOMENTE se o texto mencionar explicitamente uma conta (ex: "no nubank" → ID do Nubank Conta ou Nubank Cartão dependendo do contexto). Se o usuário não disser, retorne null. NUNCA invente um ID que não esteja na lista. NUNCA retorne string que não seja um ID exato da lista.
- metadata: objeto livre, pode incluir { "ambiguous_fields": [...], "reasoning": "..." } ou outras notas.

FORMATO DE SAÍDA (JSON ESTRITO, sem texto fora do JSON):
{
  "amount_cents": 2500,
  "type": "expense",
  "category_name": "Restaurantes",
  "subcategory_name": "Delivery",
  "merchant": "iFood",
  "occurred_on": "2026-04-22",
  "note": null,
  "confidence": 0.92,
  "account_hint": null,
  "metadata": {}
}`
}
