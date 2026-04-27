// Snapshot compacto pro insight de IA. Valores em reais (não centavos)
// pra ficar legível no prompt sem a IA precisar dividir.
// Extraído do god-file app/relatorios/balanco/page.tsx.

import type { AdjustmentsBySection, BalancoTotals } from "./balanco-helpers"
import type { Bucket, ClassificationKey, OverdueLine } from "./balanco-types"

export type BalancoAiSnapshot = ReturnType<typeof buildBalancoAiSnapshot>

const toReais = (c: number): number => Math.round(c) / 100

export function buildBalancoAiSnapshot(args: {
  periodLabel: string
  snapshotDate: string
  buckets: Map<ClassificationKey, Bucket>
  adjustmentsBySection: AdjustmentsBySection
  totals: BalancoTotals
  overdueLiabilities: OverdueLine[]
}) {
  const {
    periodLabel,
    snapshotDate,
    buckets,
    adjustmentsBySection,
    totals,
    overdueLiabilities,
  } = args

  const ativoCirculanteDisponivel = buckets.get("ativo_circulante_disponivel")
  const ativoCirculanteRendaFixa = buckets.get("ativo_circulante_renda_fixa")
  const ativoCirculanteRendaVar = buckets.get("ativo_circulante_renda_variavel")
  const ativoCirculanteCripto = buckets.get("ativo_circulante_cripto")
  const ativoNCBloqueado = buckets.get("ativo_nc_bloqueado")
  const passivoCartoes = buckets.get("passivo_circulante_cartoes")

  const bucketToAi = (b?: {
    lines: { accountName: string; cents: number }[]
  }) =>
    (b?.lines ?? []).map((l) => ({
      nome: l.accountName,
      valor: toReais(l.cents),
    }))
  const adjsToAi = (section: string) =>
    (adjustmentsBySection.get(section) ?? []).map((a) => ({
      descricao: a.label,
      valor: toReais(a.amount_cents),
    }))

  return {
    periodo: periodLabel,
    data_posicao: snapshotDate,
    ativo: {
      total: toReais(totals.ativoTotal),
      circulante: {
        total: toReais(totals.ativoCirculanteTotal),
        disponibilidades: {
          total: toReais(totals.ativoCirculanteDisponivelTotal),
          contas: bucketToAi(ativoCirculanteDisponivel),
          ajustes: [
            ...adjsToAi("ativo_circulante_disponivel"),
            ...adjsToAi("ativo_circulante_outros"),
          ],
        },
        renda_fixa: {
          total: toReais(totals.ativoCirculanteRendaFixaTotal),
          contas: bucketToAi(ativoCirculanteRendaFixa),
          ajustes: adjsToAi("ativo_circulante_renda_fixa"),
        },
        renda_variavel: {
          total: toReais(totals.ativoCirculanteRendaVarTotal),
          contas: bucketToAi(ativoCirculanteRendaVar),
          ajustes: adjsToAi("ativo_circulante_renda_variavel"),
        },
        cripto: {
          total: toReais(totals.ativoCirculanteCriptoTotal),
          contas: bucketToAi(ativoCirculanteCripto),
          ajustes: adjsToAi("ativo_circulante_cripto"),
        },
      },
      nao_circulante: {
        total: toReais(totals.ativoNCTotal),
        bloqueado_fgts: {
          total: toReais(totals.ativoNCBloqueadoTotal),
          contas: bucketToAi(ativoNCBloqueado),
        },
        imobilizado: {
          total: toReais(totals.ativoNCImobilizadoTotal),
          itens: adjsToAi("ativo_nc_imobilizado"),
        },
        intangivel: {
          total: toReais(totals.ativoNCIntangivelTotal),
          itens: adjsToAi("ativo_nc_intangivel"),
        },
      },
    },
    passivo: {
      total: toReais(totals.passivoTotal),
      circulante: {
        total: toReais(totals.passivoCirculanteTotal),
        cartoes: {
          total: toReais(passivoCartoes?.total ?? 0),
          faturas: bucketToAi(passivoCartoes),
        },
        agendadas_vencidas: overdueLiabilities.map((l) => ({
          descricao: l.label,
          vencimento: l.dueDate,
          valor: toReais(l.cents),
        })),
        outros: adjsToAi("passivo_circulante_outros"),
      },
      nao_circulante: {
        total: toReais(totals.passivoNCTotal),
        financiamentos: adjsToAi("passivo_nc_financiamentos"),
      },
    },
    patrimonio_liquido: toReais(totals.patrimonioLiquido),
  }
}
