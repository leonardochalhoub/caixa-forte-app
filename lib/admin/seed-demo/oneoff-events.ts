import type { OneOffEvent } from "./types"

// Eventos pontuais (não recorrentes) que podem acontecer em um mês qualquer
// na vida da Larissa. Cada um tem chance de ocorrer + faixa de valor.
// Usado pelo build-month-tx pra simular gastos/receitas inesperadas.
export const ONEOFF_EVENTS: OneOffEvent[] = [
  {
    chance: 0.12,
    label: "Cirurgia do Thor (vet)",
    category: "Saúde",
    min: 180000,
    max: 380000,
  },
  {
    chance: 0.08,
    label: "Cirurgia da Mel (vet)",
    category: "Saúde",
    min: 150000,
    max: 320000,
  },
  {
    chance: 0.15,
    label: "Ração + vacina dos cachorros",
    category: "Saúde",
    min: 15000,
    max: 32000,
  },
  {
    chance: 0.1,
    label: "Conserto do carro",
    category: "Transporte",
    min: 50000,
    max: 220000,
  },
  {
    chance: 0.08,
    label: "Revisão oficial Honda",
    category: "Transporte",
    min: 45000,
    max: 90000,
  },
  {
    chance: 0.06,
    label: "Dentista",
    category: "Saúde",
    min: 30000,
    max: 180000,
  },
  {
    chance: 0.07,
    label: "Geladeira nova",
    category: "Cuidados Pessoais",
    min: 250000,
    max: 420000,
  },
  {
    chance: 0.05,
    label: "Celular novo",
    category: "Cuidados Pessoais",
    min: 200000,
    max: 450000,
  },
  {
    chance: 0.1,
    label: "Viagem fim de semana",
    category: "Lazer",
    min: 60000,
    max: 180000,
  },
  {
    chance: 0.05,
    label: "Viagem internacional",
    category: "Lazer",
    min: 400000,
    max: 900000,
  },
  {
    chance: 0.06,
    label: "Presente aniversário família",
    category: "Lazer",
    min: 15000,
    max: 60000,
  },
  {
    chance: 0.04,
    label: "Curso online",
    category: "Cuidados Pessoais",
    min: 40000,
    max: 120000,
  },
  {
    chance: 0.05,
    label: "Doação cirurgia avó",
    category: "Saúde",
    min: 100000,
    max: 200000,
  },
]
