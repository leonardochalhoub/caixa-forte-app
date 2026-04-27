# ADR 0005 — Abstração de Provider LLM

**Status**: Aceito · 2026-04 (Conselho v1)

## Contexto

5 callsites no codebase importavam direto `groq-sdk`:
- `lib/parser/parse-transaction.ts` — parser de tx via texto
- `lib/categories/generator.ts` — gerador inicial de categorias
- `lib/ai/trend-explainer.ts` — análise de tendência
- `app/api/ai/balanco-analysis/route.ts` — chat sobre balanço (fetch direto)
- `app/api/ai/suggest-registry/route.ts` — sugestor de partida dobrada

Risco: lock-in implícito. Se Groq mudar pricing, modelo, ou descontinuar,
parser quebra em 5 lugares.

## Decisão

Criar `lib/llm/provider.ts` como **único ponto** que importa SDK do
provider. Exporta:

- `getLLMClient()` — cliente cacheado
- `LLM_MODELS` — { chat, parser, whisper, parserFallback }
- `LLM_ENDPOINT` — URL pra fetch direto
- `getLLMApiKey()` — chave do provider ativo

Provider escolhido via `LLM_PROVIDER` env var (default `'groq'`). Hoje
só Groq tem implementação; arquivo está pronto pra adicionar OpenAI,
Anthropic, Together, Bedrock atrás do mesmo shape.

## Migração

5 callsites trocaram import:
```diff
- import { getGroqClient, GROQ_MODELS } from "@/lib/groq/client"
+ import { getLLMClient, LLM_MODELS } from "@/lib/llm/provider"
```

`lib/groq/client.ts` virou re-export deprecado pra evitar quebra.

## Consequências

### Vantagens

- Trocar provider = editar 1 arquivo (`provider.ts`) + setar env var.
- Tipo de retorno continua sendo o do SDK Groq (compat) — quando trocar
  de provider, talvez precise abstrair shape (futuro).

### Desvantagens

- Indireção a mais. Aceito (single point of change vence).
- Tipos do retorno são "Groq" — abstrair via interface explícita só
  quando segundo provider entrar (YAGNI agora).

## Referências

- `lib/llm/provider.ts`
- `lib/groq/client.ts` (re-export deprecado)
- Conselho v1 (the-planner): risco existencial #2 era "lock-in Groq"
