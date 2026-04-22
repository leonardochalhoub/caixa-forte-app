# BRAINSTORM: Caixa Forte

> Exploratory session to clarify intent and approach before requirements capture

## Metadata

| Attribute | Value |
|-----------|-------|
| **Feature** | CAIXA_FORTE (app inteiro — MVP) |
| **Date** | 2026-04-22 |
| **Author** | brainstorm-agent |
| **Status** | Ready for Define |

---

## Initial Idea

**Raw Input:**
> "I want to create a personal financial app for controlling ins and outs of money. It can be bigger in the future, with finance stuff like portfolio control etc. but for now I want to think of a prototype to be easy to use, with nice graphs showing what's happening, questioning where money went. Reference repo: https://github.com/leonardochalhoub/amazing-school-app. Registration via web and Telegram (text + audio via Groq). Monochrome palette white→grey→black, different from amazing-school."

**Context Gathered:**

- Repo novo (`/home/leochalhoub/caixa-forte-app`) — só LICENSE, README e estrutura SDD.
- Template de referência (`amazing-school-app`) usa: Next.js 16 (App Router) + React 19 + TS, Tailwind v4 + shadcn/ui, Supabase Postgres com RLS, Groq (llama-3.3-70b + Whisper), Vercel, Vitest + Playwright.
- Usuário é Brasileiro, desenvolvedor solo, prefere paletas monocromáticas, UI em pt-br.
- Usuário valoriza entrada rápida e paridade arquitetural com o amazing-school-app.

**Technical Context Observed (for Define):**

| Aspect | Observation | Implication |
|--------|-------------|-------------|
| Likely Location | `app/` (rotas), `components/`, `lib/` (server actions + Groq/Telegram), `supabase/migrations/` | Mirror do amazing-school-app |
| Relevant KB Domains | Supabase RLS, Next.js App Router, Groq structured output, Telegram Bot API | Patterns existentes para reaproveitar |
| IaC Patterns | Supabase CLI migrations + Vercel CLI + env vars | Mesmo do template |

---

## Discovery Questions & Answers

| # | Question | Answer | Impact |
|---|----------|--------|--------|
| 1 | Quem é o MVP? (single-user / convidados / aberto) | Aberto a qualquer usuário | Supabase Auth + RLS desde o dia 1, mesmo que amazing-school-app |
| 2 | "Grok" é xAI Grok ou Groq Cloud? | Groq (same as template) | Reusa SDK/chaves do template; Whisper disponível para transcrição |
| 3 | Como registrar no MVP? (web / Telegram / ambos) | Web + Telegram desde o dia 1 | Parser unificado numa função server-side; Telegram webhook + web form chamam o mesmo core |
| 4 | Como é "questionar para onde foi o dinheiro"? | All of that (dashboard + chat + alertas) | Approach B escolhido; escopo completo, entregue em milestones |
| 5 | Amostras para grounding do LLM? | Nada pronto — começar do zero | Vou gerar categorias padrão BR + few-shot prompts fictícios; usuário ajusta no uso |
| 6 | Ajuste ao data model? | Multi-conta + categorias hierárquicas + auto-categorização inteligente com drill-down | `accounts` table + `categories.parent_id` + Groq recebe lista das categorias do usuário no prompt |
| 7 | UI suficiente? | Cobriu, pode escrever o BRAINSTORM | Segue com 10 rotas + dashboard completo |

---

## Sample Data Inventory

| Type | Location | Count | Notes |
|------|----------|-------|-------|
| Input files | N/A | 0 | Usuário começa do zero |
| Output examples | N/A | 0 | Schema proposto abaixo; few-shot gerado na fase Define |
| Ground truth | N/A | 0 | Usuário vai validar categorização manualmente no início |
| Related code | amazing-school-app | 1 repo | Parseá-lo como referência viva para stack/padrões |

**How samples will be used:**

- Fase Define vai gerar ~20 exemplos fictícios de entradas pt-br ("20 mercado da maria", "recebi 3500 salário dia 5", "uber 18,40") para few-shot do parser.
- Categorias padrão BR (Mercado, Transporte, Lazer, Saúde, Contas Fixas, Renda, Educação, Restaurantes, Assinaturas, Outros) seed na migration inicial.
- Após uso real por alguns dias, o usuário ajusta prompt e categorias com dados reais.

---

## Approaches Explored

### Approach A: Lean Core

**Description:** MVP enxuto — auth + CRUD transações + parser Groq + dashboard monocromático + bot Telegram. Chat/alertas/multi-conta como roadmap pós-MVP.

**Pros:**
- Ship em ~1 semana
- Parser é a peça crítica — foco total nela
- Risco de scope creep minimizado

**Cons:**
- Vision completo ("all of that") vira roadmap, não MVP
- Sem chat conversacional no dia 1

**Why NOT selected:** Usuário escolheu escopo completo consciente do trade-off.

---

### Approach B: Full Vision ⭐ Selected

**Description:** Tudo no MVP — dashboard + chat conversacional + alertas proativos + Telegram (texto + áudio) + web, multi-conta, categorias hierárquicas, auto-categorização por LLM.

**Pros:**
- Produto completo desde o lançamento — usuário vê o potencial inteiro
- Chat + alertas são diferenciais reais vs. apps commodity (Mobills, Organizze)
- Forçar estrutura completa evita refactors grandes depois

**Cons:**
- ~3x o escopo do Lean Core — estimativa realista: 3–4 semanas de dev focado
- Três superfícies paralelas (dashboard, chat, alertas) diluem polish
- Risco maior de travar numa peça e atrasar tudo

**Mitigation:** Organizar a fase Build em **milestones ship-ready** — M1 (auth+CRUD+dashboard), M2 (Telegram+Groq parser), M3 (chat conversacional), M4 (alertas). Em qualquer M pode-se pausar e usar.

**Why Recommended:** Usuário foi explícito 2x (resposta "all of that" + escolha explícita da Approach B).

---

### Approach C: Telegram-First

**Description:** Zero UI de entrada web, só bot + painel read-only.

**Pros:** Superfície menor.

**Cons:** Usuário quer "nice graphs" e UI completa; sem web fica incoerente com multi-user.

**Why NOT selected:** Incompatível com requisito de UI rica.

---

## Selected Approach

| Attribute | Value |
|-----------|-------|
| **Chosen** | Approach B — Full Vision (entregue em 4 milestones) |
| **User Confirmation** | 2026-04-22, resposta direta "B — Full Vision" |
| **Reasoning** | Usuário quer o app completo e aceita trade-off de escopo maior. Será organizado em milestones ship-ready para mitigar risco. |

---

## Stack (mirror de amazing-school-app)

| Camada | Escolha |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript |
| UI | Tailwind v4 + shadcn/ui + Radix |
| Auth + DB | Supabase (Postgres + RLS + Auth magic link) |
| AI | Groq Cloud — `llama-3.3-70b` para parsing/chat, `whisper-large-v3` para áudio |
| Charts | Recharts (ou Visx) — monocromático |
| Bot | Telegram Bot API via webhook Next.js |
| Testing | Vitest (unit + integration) + Playwright (e2e) |
| Deploy | Vercel (app) + Supabase (managed DB) |

---

## Data Model

```
profiles
  user_id (FK auth.users) PK
  display_name text
  telegram_chat_id bigint nullable (único)
  onboarded_at timestamptz nullable
  created_at timestamptz default now()

accounts
  id uuid PK
  user_id (FK) NOT NULL
  name text NOT NULL               -- ex: "Nubank", "Itaú", "Dinheiro"
  type text CHECK (checking|credit|cash|wallet)
  color_hex text                   -- derivado da paleta monocromática
  sort_order int default 0
  created_at timestamptz
  archived_at timestamptz nullable

categories
  id uuid PK
  user_id (FK) NOT NULL
  parent_id uuid nullable (self-ref → categories.id ON DELETE SET NULL)
  name text NOT NULL
  icon text nullable                -- lucide icon name
  color_hex text
  sort_order int default 0
  is_income boolean default false   -- flag "categoria de entrada"
  archived_at timestamptz nullable
  UNIQUE (user_id, parent_id, name)

transactions
  id uuid PK
  user_id (FK) NOT NULL
  account_id (FK accounts) NOT NULL
  category_id (FK categories) nullable  -- nullable se Groq falhar; UI mostra "sem categoria"
  type text CHECK (income|expense) NOT NULL
  amount_cents bigint NOT NULL CHECK (> 0)
  occurred_on date NOT NULL
  merchant text nullable             -- "Mercado da Maria", extraído pelo Groq
  note text nullable                 -- observação livre
  source text CHECK (web|telegram_text|telegram_voice|manual)
  raw_input text nullable            -- "20 mercado da maria"
  groq_parse_json jsonb nullable     -- {amount, type, category_id, merchant, confidence}
  groq_confidence numeric(3,2) nullable
  needs_review boolean generated always as (groq_confidence < 0.70) stored
  created_at timestamptz default now()
  updated_at timestamptz

conversations
  id uuid PK
  user_id (FK) NOT NULL
  channel text CHECK (web|telegram)
  title text nullable                -- auto-gerado pelo LLM após 1ª resposta
  started_at timestamptz default now()
  last_message_at timestamptz

messages
  id uuid PK
  conversation_id (FK) NOT NULL
  role text CHECK (user|assistant|tool)
  content text
  tool_calls_json jsonb nullable     -- text-to-SQL results ou metric lookups
  created_at timestamptz default now()

alerts
  id uuid PK
  user_id (FK) NOT NULL
  name text                           -- "Gasto em Lazer acima da média"
  rule_json jsonb                     -- {metric, window, threshold_type, threshold_value, categories?}
  enabled boolean default true
  last_evaluated_at timestamptz
  last_triggered_at timestamptz
  created_at timestamptz

alert_events
  id uuid PK
  alert_id (FK) NOT NULL
  triggered_at timestamptz default now()
  snapshot_json jsonb                 -- métrica no momento do disparo
  acknowledged_at timestamptz nullable
```

**RLS:** Toda tabela com `user_id` tem policy `user_id = auth.uid()` (select/insert/update/delete).

**Índices chave:**
- `transactions (user_id, occurred_on DESC)` — dashboard, lista
- `transactions (user_id, category_id, occurred_on DESC)` — drill-down
- `transactions (user_id, account_id)` — tela de contas
- `profiles (telegram_chat_id) UNIQUE` — lookup de webhook

**Decisões de tipo:**
- `amount_cents bigint` evita float
- `groq_parse_json` preserva payload do LLM para re-parse quando prompt melhorar
- `needs_review` como generated column evita inconsistência com confidence
- `categories.parent_id` self-ref; hierarquia rasa (1 nível) suficiente para MVP, mas o schema permite profundidade

---

## UI / Screens (MVP)

### Rotas

| Rota | Tela |
|---|---|
| `/` | Landing monocromática — hero + CTA |
| `/login`, `/signup` | Email + magic link |
| `/onboarding` | 3 passos: contas → confirmar categorias padrão → vincular Telegram (opcional) |
| `/app` | Dashboard (home) |
| `/app/transacoes` | Lista completa com filtros (data, conta, categoria, tipo) |
| `/app/transacoes/[id]` | Detalhe + edição inline |
| `/app/contas` | Cards das contas com saldo; CRUD |
| `/app/categorias` | Árvore hierárquica; drill-down → transações da categoria + filhas (editáveis) |
| `/app/chat` | Chat conversacional persistente |
| `/app/alertas` | Regras + histórico de alertas |
| `/app/config` | Perfil, Telegram, preferências |

### Dashboard — layout

```
┌────────────────────────────────────────────────────┐
│ Caixa Forte                        [avatar] Leo ▾ │
├────────────────────────────────────────────────────┤
│  Abril 2026                                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ ↑ Entrou │ │ ↓ Saiu   │ │ = Saldo  │           │
│  │ R$ 8.240 │ │ R$ 5.117 │ │ R$ 3.123 │           │
│  └──────────┘ └──────────┘ └──────────┘           │
│                                                    │
│  [ o que rolou? ex: "25 ifood ontem"       ↵ ]    │
│                                                    │
│  ┌─────────────────┐  ┌──────────────────────┐    │
│  │ Por categoria  │  │ Últimos 6 meses      │    │
│  │ (pizza mono)   │  │ (linha in vs out)    │    │
│  └─────────────────┘  └──────────────────────┘    │
│                                                    │
│  Últimas transações                        ver →  │
│  22/04  ↓  Mercado da Maria    · Mercado   · Nu   │
│         R$ 20,00                                   │
│  22/04  ↑  Salário             · Renda     · Ita  │
│         R$ 3.500,00                                │
│  21/04  ↓  Uber                · Transporte · Nu  │
│         R$ 18,40                                   │
└────────────────────────────────────────────────────┘
```

### Design tokens — paleta monocromática

| Token | Valor | Uso |
|---|---|---|
| `bg-base` | `#FFFFFF` | fundo principal |
| `bg-subtle` | `#F5F5F5` | cards, header |
| `border` | `#E5E5E5` | bordas |
| `text-muted` | `#A3A3A3` | texto secundário |
| `text-body` | `#525252` | texto padrão |
| `text-strong` | `#171717` | títulos |
| `ink` | `#000000` | logo, ênfase máxima |

**Cores semânticas (única exceção ao monocromático):**

| Token | Valor | Uso |
|---|---|---|
| `income` | `#16A34A` | seta ↑ e valores de entrada |
| `expense` | `#DC2626` | seta ↓ e valores de saída |

**Regras:**
- Setas 16px sempre ao lado do valor (não substituem o sinal `R$`)
- Nenhum outro elemento colorido — sem gradientes, ícones coloridos, etc.
- Tipografia: Geist (default Next.js) ou Inter
- Cards: `border border-[#E5E5E5] shadow-sm rounded-lg`

### Auto-categorização visual

- Transação criada via texto/áudio → toast: **"✅ Categorizado como Mercado (94%)"**
- `needs_review = true` (confidence < 70%) → badge cinza escuro **"Revisar"** na linha da transação
- Clique na categoria da linha → `/app/categorias/[id]` com drill-down

---

## Technical Flow

### Entrada via Telegram (texto ou áudio)

```text
[Telegram user] --mensagem--> [Telegram Bot API]
                                     │
                                     ▼
                       [Vercel fn /api/telegram/webhook]
                              │
             ┌────────────────┼────────────────┐
        (se áudio)         (se texto)
             │                   │
     Groq Whisper           passa direto
     transcreve                  │
             └──────┬────────────┘
                    ▼
   [parseTransaction(rawInput, userCategories, userAccounts)]
                    │  (Groq llama-3.3-70b com structured output)
                    ▼
         [Supabase: insert into transactions]
                    │
                    ▼
   [Bot responde: "✅ R$ 20,00 em Mercado (Mercado da Maria). /editar /cancelar"]
```

### Entrada via Web

```text
[User digita no input do dashboard] ── POST /api/transactions/parse ──┐
                                                                     │
                    [mesma função parseTransaction()] ←───────────────┘
                                │
                                ▼
               [Supabase: insert + revalidatePath('/app')]
                                │
                                ▼
             [toast de confirmação; linha aparece na lista]
```

### Chat conversacional

```text
[User: "quanto gastei com iFood em março?"]
              │
              ▼
  [POST /api/chat/stream]
              │
              ▼
  [Groq llama-3.3-70b com tools:
     - get_transactions(date_range, category?, merchant?)
     - get_summary(metric, group_by, window)
   ]
              │  tool call → executa query RLS-safe no Supabase
              ▼
  [Stream resposta formatada + gravar em messages]
```

### Alertas

- Cron job Vercel (diário) → avalia cada `alerts.rule_json` ativa.
- Se dispara: `insert into alert_events` + notifica por Telegram (e push web no futuro).
- Regras suportadas no MVP: `total_by_category_in_window > threshold` e `total_by_category_in_window > avg_last_N_windows * multiplier`.

---

## Key Decisions Made

| # | Decision | Rationale | Alternative Rejected |
|---|----------|-----------|----------------------|
| 1 | Stack = espelho do amazing-school-app | Usuário domina; reuso de padrões; menos fricção | Stack nova (Remix, SvelteKit) |
| 2 | Groq (not xAI Grok) | Template usa, Whisper disponível, mais barato | xAI Grok (exige integração nova) |
| 3 | Web + Telegram desde dia 1 | Usuário pediu explicitamente; parser unificado evita duplicação | Só Telegram / só web |
| 4 | Multi-conta no MVP | Usuário pediu; realista para uso real | Conta única implícita |
| 5 | Categorias hierárquicas (parent_id) | Usuário pediu; schema suporta drill-down | Tags planas |
| 6 | Auto-categorização por Groq | Usuário quer entrada rápida; chave do diferencial | Usuário escolhe manual sempre |
| 7 | `amount_cents bigint` | Evita bug de float com centavos | `numeric(12,2)` |
| 8 | Paleta monocromática + verde/vermelho semânticos | Pedido explícito do usuário | Cores por categoria |
| 9 | Supabase Auth + RLS | Match com template, isola dados por user | Auth caseiro |
| 10 | Build em 4 milestones ship-ready | Mitiga risco de escopo grande da Approach B | Big bang 4 semanas |

---

## Features Removed (YAGNI)

| Feature Suggested | Reason Removed | Can Add Later? |
|-------------------|----------------|----------------|
| Multi-moeda (BRL, USD, EUR) | Usuário brasileiro, sem necessidade real | Sim — coluna `currency` em accounts |
| Portfolio / investimentos (ações, renda fixa, cripto) | Fora do escopo MVP por decisão do usuário | Sim — novo modelo `holdings` |
| Contas compartilhadas (casal, família) | Não pedido; complexifica RLS | Sim — tabela `account_members` |
| Export fiscal (IRPF, DIMOB) | Uso específico, demanda não validada | Sim |
| Metas de gasto (budgets) explícitas | Parcialmente coberto por alertas "gasto acima de X" | Sim — tabela `budgets` |
| OCR de notas fiscais / comprovantes | Fora do escopo; foco em voz/texto | Sim — pipeline de upload de imagem |
| PWA / app mobile nativo | Next.js responsivo cobre MVP | Sim |
| Recorrência automática de transações fixas | Complexifica schema; usuário pode re-lançar | Sim — tabela `recurring_transactions` |

---

## Incremental Validations

| Section | Presented | User Feedback | Adjusted? |
|---------|-----------|---------------|-----------|
| Data model inicial (7 tabelas) | ✅ | "quero multiconta, categorias hierárquicas, IA pra categorizar com drill-down" | ✅ Sim — adicionei `accounts`, `categories.parent_id`, `merchant`, `groq_parse_json`, drill-down por categoria |
| Fluxo técnico Telegram + parser unificado | ✅ | "brainstorm parece incompleto — quero UI completa, setas verde/vermelho" | ✅ Sim — adicionei seção UI / Screens com 10 rotas, wireframe do dashboard, paleta semântica |
| UI / Screens expandida | ✅ | "Cobriu, pode escrever o BRAINSTORM" | ✅ Sem mudanças |

---

## Suggested Requirements for /define

### Problem Statement (Draft)

> Brasileiros que querem controlar entradas e saídas de dinheiro de forma rápida (voz ou texto via Telegram, ou web) e visualizar para onde o dinheiro foi, sem precisar preencher formulários longos ou importar planilhas.

### Target Users (Draft)

| User | Pain Point |
|------|------------|
| Leonardo (proto-usuário) | Quer registrar gastos em 3s via Telegram de áudio e ver gráficos limpos do mês |
| Usuário brasileiro tech-friendly | Apps existentes (Mobills, Organizze) exigem muito form; quer conversação + auto-categorização |

### Success Criteria (Draft)

- [ ] Usuário consegue registrar uma transação em **< 5 segundos** (texto web ou áudio Telegram)
- [ ] Auto-categorização acerta em **≥ 85%** dos casos comuns (validação: 20 exemplos fictícios na fase Define)
- [ ] Dashboard carrega em **< 2s** com até 10k transações
- [ ] Chat responde perguntas de métricas em **< 5s** com dados corretos
- [ ] Alertas disparam dentro de **24h** do evento que os aciona
- [ ] UI 100% pt-br, paleta monocromática com ↑verde/↓vermelho como única exceção
- [ ] Cobertura de testes: ≥ 70% unit (Vitest), 1 smoke e2e (Playwright) por milestone

### Constraints Identified

- **Idioma:** pt-br apenas (UI, prompts, mensagens de bot)
- **Stack fixa:** Next.js + Supabase + Groq + Vercel (paridade com amazing-school-app)
- **Paleta:** monocromática obrigatória; verde/vermelho só para setas/valores
- **LLM provider:** Groq; nunca OpenAI/Anthropic no MVP
- **Moeda:** BRL apenas
- **Dados:** RLS por `user_id` em todas as tabelas
- **Dev solo:** todas escolhas devem favorecer velocidade de 1 dev

### Out of Scope (Confirmed)

- Multi-moeda
- Portfolio / investimentos
- Contas compartilhadas
- OCR de comprovantes
- Recorrência automática de transações
- Export fiscal (IRPF)
- App mobile nativo / PWA
- Integração direta com bancos (Open Finance)

---

## Milestones Proposed (para /define detalhar)

| M | Nome | Entrega ship-ready |
|---|------|---------------------|
| M1 | **Foundation** | Auth + onboarding + contas + categorias + CRUD manual de transações + dashboard (KPIs + lista). Usuário consegue usar como "planilha bonita". |
| M2 | **Smart Capture** | Parser Groq no input web + webhook Telegram (texto + áudio via Whisper) + auto-categorização + flag de review. Usuário fala/digita → registra. |
| M3 | **Insights** | Chat conversacional com tool-calling (queries sobre transações) + 2 gráficos (pizza + linha) polidos + drill-down por categoria. |
| M4 | **Alertas** | Motor de regras + cron diário + notificação Telegram + UI de alertas configuráveis. |

**Critério de "ship-ready":** ao final de cada M, o app está usável em produção (Vercel + Supabase prod), com testes mínimos e deploy automático do `main`.

---

## Session Summary

| Metric | Value |
|--------|-------|
| Questions Asked | 7 |
| Approaches Explored | 3 |
| Features Removed (YAGNI) | 8 |
| Validations Completed | 3 |
| Duration | ~1 sessão de brainstorm |

---

## Next Step

**Ready for:** `/define .claude/sdd/features/BRAINSTORM_CAIXA_FORTE.md`

A fase Define vai:
1. Extrair functional + non-functional requirements formais
2. Gerar os 20 exemplos de input pt-br para few-shot do parser
3. Definir as 10 categorias padrão BR (+ hierarquia sugerida)
4. Detalhar as 4 milestones com acceptance criteria por milestone
5. Elaborar user stories por rota
