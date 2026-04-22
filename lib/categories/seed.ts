export interface SeedCategory {
  name: string
  isIncome: boolean
  children?: string[]
}

export const DEFAULT_CATEGORIES_BR: SeedCategory[] = [
  { name: "Mercado", isIncome: false, children: ["Supermercado", "Hortifruti", "Padaria"] },
  { name: "Transporte", isIncome: false, children: ["Combustível", "App", "Transporte Público", "Manutenção"] },
  { name: "Restaurantes", isIncome: false, children: ["Delivery", "Bar/Café", "Restaurante"] },
  { name: "Contas Fixas", isIncome: false, children: ["Moradia", "Energia", "Água", "Internet", "Telefone"] },
  { name: "Saúde", isIncome: false, children: ["Farmácia", "Plano", "Consulta", "Academia"] },
  { name: "Lazer", isIncome: false, children: ["Cinema", "Viagem", "Jogos", "Eventos"] },
  { name: "Educação", isIncome: false, children: ["Cursos", "Livros", "Mensalidade"] },
  { name: "Assinaturas", isIncome: false, children: ["Streaming", "Software", "Outras"] },
  { name: "Renda", isIncome: true, children: ["Salário", "Extra", "Investimentos", "Reembolso"] },
  { name: "Outros", isIncome: false },
]
