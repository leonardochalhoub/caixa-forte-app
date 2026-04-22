import { z } from "zod"
import { getGroqClient, GROQ_MODELS } from "@/lib/groq/client"
import { DEFAULT_CATEGORIES_BR } from "./seed"

export const CategoryNode = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(40),
  is_income: z.boolean(),
  children: z.array(z.string().trim().min(1).max(40)).max(8).default([]),
})

export const GeneratedCategoriesSchema = z.object({
  categories: z.array(CategoryNode).min(6).max(14),
})

export type GeneratedCategories = z.infer<typeof GeneratedCategoriesSchema>

const SYSTEM_PROMPT = `Você é um especialista em finanças pessoais no Brasil. Sua tarefa é criar uma árvore de categorias de gastos e ganhos personalizada para um usuário, baseada na descrição que ele der sobre sua rotina e vida.

REGRAS INEGOCIÁVEIS:
- TUDO em pt-br, nomes curtos e familiares (ex: "Mercado", "Transporte", "Lazer").
- Entre 8 e 12 categorias pai.
- Pelo menos UMA categoria com is_income=true para Renda (ex: Salário, Freelance, Investimentos).
- Cada categoria pai pode ter de 0 a 6 subcategorias.
- Misture categorias padrão brasileiras (Mercado, Transporte, Saúde, Moradia, Contas Fixas, Lazer, Renda, Outros) com categorias que REFLETEM a descrição do usuário.
- Não duplique nomes no mesmo nível (pai ou filho).
- Se o usuário mencionar hábitos específicos (ex: pizza toda sexta, academia, pet, viagens frequentes), crie subcategorias correspondentes.
- Se a descrição for vazia ou sem sinais, retorne apenas as categorias padrão brasileiras.
- Nomes curtos (máx 25 chars), sem emojis, sem explicações.

FORMATO DE SAÍDA (JSON estrito):
{
  "categories": [
    { "name": "Comida", "is_income": false, "children": ["Supermercado", "Pizza", "Hambúrguer"] },
    { "name": "Transporte", "is_income": false, "children": ["Gasolina", "Uber"] },
    { "name": "Renda", "is_income": true, "children": ["Salário", "Freelance"] },
    ...
  ]
}`

export async function generateCategoriesFromDescription(
  description: string,
): Promise<{ categories: GeneratedCategories["categories"]; source: "groq" | "fallback" }> {
  const groq = getGroqClient()
  if (!groq) return { categories: defaultsAsNodes(), source: "fallback" }

  const trimmed = description.trim()
  if (!trimmed) return { categories: defaultsAsNodes(), source: "fallback" }

  try {
    const resp = await groq.chat.completions.create({
      model: GROQ_MODELS.chat,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Descrição do usuário:\n\n${trimmed}\n\nGere a árvore de categorias em JSON agora.`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.4,
      max_tokens: 1500,
    })

    const raw = resp.choices[0]?.message?.content
    if (!raw) throw new Error("Groq retornou vazio")

    const parsed = GeneratedCategoriesSchema.parse(JSON.parse(raw))
    return { categories: parsed.categories, source: "groq" }
  } catch (err) {
    console.error("generateCategoriesFromDescription falhou, caindo em fallback:", err)
    return { categories: defaultsAsNodes(), source: "fallback" }
  }
}

function defaultsAsNodes(): GeneratedCategories["categories"] {
  return DEFAULT_CATEGORIES_BR.map((c) => ({
    name: c.name,
    is_income: c.isIncome,
    children: c.children ?? [],
  }))
}
