# DEFINE: Caixa Forte

> App pessoal de controle financeiro (pt-br) com entrada rápida por texto/voz via web ou Telegram, auto-categorização por LLM, dashboard monocromático e chat conversacional sobre os dados.

## Metadata

| Attribute | Value |
|-----------|-------|
| **Feature** | CAIXA_FORTE (MVP completo — 4 milestones) |
| **Date** | 2026-04-22 |
| **Author** | define-agent |
| **Status** | Ready for Design |
| **Clarity Score** | 15/15 |

---

## Problem Statement

Brasileiros tech-friendly que tentam controlar gastos em planilhas ou apps commodity (Mobills, Organizze) abandonam o controle porque o registro exige formulário longo e a categorização manual é tediosa. Caixa Forte permite registrar uma transação em < 5 segundos via texto no navegador ou áudio no Telegram, categoriza automaticamente com Groq, e mostra onde o dinheiro foi num dashboard limpo — sem banners, sem upsell, sem cor gratuita.

---

## Target Users

| User | Role | Pain Point |
|------|------|------------|
| **Leonardo (proto-usuário)** | Dev solo, dono do app | Lança gastos no WhatsApp da casa e nunca consolida; quer falar "uber 18,40" no Telegram e pronto |
| **Usuário BR tech-friendly** | 25–45 anos, múltiplos bancos | Cansado de importar CSV do Nubank todo mês; quer categorização automática boa e gráficos que realmente informam |
| **Parceiro/Parceira do proto-usuário** | Uso secundário, casual | Só quer olhar no celular "quanto sobrou esse mês"; zero tolerância a UI confusa |

---

## Goals

| Priority | Goal |
|----------|------|
| **MUST** | Registrar transação em < 5s (texto web OU áudio Telegram) |
| **MUST** | Auto-categorização com ≥ 85% de acerto em casos comuns pt-br |
| **MUST** | Dashboard monocromático com KPIs do mês (entradas ↑, saídas ↓, saldo) + lista de últimas transações com setas semânticas |
| **MUST** | Multi-usuário com Supabase Auth + RLS isolando dados por `user_id` |
| **MUST** | Multi-conta (Nubank, Itaú, Dinheiro, etc.) + categorias hierárquicas (pai/filho) |
| **MUST** | UI 100% pt-br |
| **SHOULD** | Chat conversacional ("quanto gastei com iFood em março?") com tool-calling sobre as transações |
| **SHOULD** | Alertas configuráveis por regra (gasto por categoria acima de threshold/média) com notificação Telegram |
| **SHOULD** | Drill-down por categoria com edição inline das transações |
| **COULD** | Exportação CSV / metas de budget explícitas / comparativo ano a ano |

---

## Success Criteria

- [ ] **Latência de captura:** P95 web ≤ 3s do Enter até toast de confirmação; P95 Telegram texto ≤ 4s; P95 Telegram áudio ≤ 8s (inclui Whisper)
- [ ] **Acurácia do parser:** ≥ 85% de acerto de categoria em suite de 20 entradas de referência pt-br (abaixo); ≥ 95% em valor/data; ≥ 90% em tipo (income/expense)
- [ ] **Performance dashboard:** < 2s para carregar `/app` com até 10k transações no usuário (P95)
- [ ] **Latência do chat:** primeira tokenização em < 2s; resposta completa em < 5s para queries simples
- [ ] **Alertas:** avaliados diariamente via cron; disparam dentro de 24h do evento; notificação Telegram em < 30s do disparo
- [ ] **Confiança flag:** 100% das transações com `groq_confidence < 0.70` recebem badge "Revisar" na lista
- [ ] **Isolamento de dados:** 0 vazamentos em testes de RLS (cada user lê apenas suas linhas)
- [ ] **Cobertura de testes:** ≥ 70% unit coverage (Vitest) no parser, action servers e motor de alertas; 1 Playwright smoke e2e por milestone cobrindo a jornada principal
- [ ] **i18n:** 100% das strings visíveis ao usuário em pt-br; 0 strings hardcoded em inglês fora de logs/código
- [ ] **Paleta:** auditoria visual confirma apenas tons #FFFFFF→#000000 + `#16A34A` (↑) + `#DC2626` (↓)

---

## Acceptance Tests

### M1 — Foundation

| ID | Scenario | Given | When | Then |
|----|----------|-------|------|------|
| AT-001 | Signup + onboarding | Nenhum usuário logado | Usuário cria conta por magic link e completa os 3 passos de onboarding | Profile criado, ao menos 1 account criada, 10 categorias padrão BR presentes, redireciona a `/app` |
| AT-002 | CRUD transação manual | Usuário autenticado com 1 conta e categorias | Cria transação pelo form completo (sem Groq) | Registro persiste, aparece na lista do dashboard com seta correta (↑ ou ↓) |
| AT-003 | Dashboard KPIs | Usuário com 5 transações no mês atual | Abre `/app` | Cards mostram soma de entradas, soma de saídas, saldo = entradas − saídas, tudo em BRL com formatação pt-br (R$ 1.234,56) |
| AT-004 | RLS isolamento | User A tem transações; User B loga | User B abre `/app` | User B vê 0 transações; queries diretas no Supabase confirmam RLS bloqueando |
| AT-005 | Seta semântica | Lista de transações mista | Renderiza | Cada linha de income tem ↑ em `#16A34A`, cada expense tem ↓ em `#DC2626`, valor formatado pt-br |

### M2 — Smart Capture

| ID | Scenario | Given | When | Then |
|----|----------|-------|------|------|
| AT-010 | Entrada web via texto livre | Usuário no `/app` com input focado | Digita "20 mercado da maria" e pressiona Enter | Toast "✅ R$ 20,00 em Mercado (Mercado da Maria, 94%)", transação aparece na lista em ≤ 3s |
| AT-011 | Entrada Telegram texto | Usuário com `telegram_chat_id` vinculado | Envia "recebi 3500 salário dia 5" ao bot | Bot responde "✅ R$ 3.500,00 em Renda · Itaú · 05/04", transação persiste com `source=telegram_text` |
| AT-012 | Entrada Telegram áudio | Usuário vinculado | Envia áudio de 3s dizendo "uber dezoito e quarenta ontem" | Whisper transcreve, Groq parseia, bot confirma, `source=telegram_voice`, `raw_input` contém transcrição |
| AT-013 | Baixa confiança flag | Entrada ambígua "comprei coisa 50" | Submete | Transação salva com `groq_confidence < 0.70`, badge "Revisar" visível na lista |
| AT-014 | Conta inferida | Usuário tem 3 contas, a última usada foi "Nubank" | Lança "15 café" sem especificar conta | Transação vai para "Nubank" (última usada); se mencionar "itau" vai para Itaú |
| AT-015 | Suite de 20 exemplos | Batch job roda suite (abaixo) | Chama `parseTransaction()` em cada | Acurácia categoria ≥ 85%, tipo ≥ 90%, valor ≥ 95%, data ≥ 95% |

### M3 — Insights

| ID | Scenario | Given | When | Then |
|----|----------|-------|------|------|
| AT-020 | Gráfico pizza | Usuário com transações em ≥ 3 categorias no mês | Abre `/app` | Pizza monocromática (tons de cinza) exibe % por categoria; tooltip em pt-br |
| AT-021 | Gráfico linha 6 meses | Usuário com histórico ≥ 3 meses | Abre `/app` | Linha dupla (entrada vs saída) últimos 6 meses; hover mostra valor do mês |
| AT-022 | Drill-down categoria | Usuário clica na fatia "Mercado" da pizza | — | Navega a `/app/categorias/[id]`, lista todas transações de Mercado + subcategorias; edição inline funciona |
| AT-023 | Chat query simples | Usuário em `/app/chat` | Pergunta "quanto gastei com iFood em março?" | Chat responde com valor correto e lista as transações encontradas em ≤ 5s |
| AT-024 | Chat RLS safety | User A pergunta sobre seus dados | Tool call executa query | Tool só retorna linhas com `user_id = auth.uid()`; User A não consegue ver dados de User B mesmo via prompt injection |

### M4 — Alertas

| ID | Scenario | Given | When | Then |
|----|----------|-------|------|------|
| AT-030 | Criar regra | Usuário em `/app/alertas` | Configura "Lazer > média das últimas 4 semanas × 1.5" | Regra persiste em `alerts`, `enabled=true` |
| AT-031 | Cron avalia e dispara | Cron diário roda, usuário gastou 2x a média em Lazer | Cron avalia | Insere linha em `alert_events`, envia mensagem Telegram em ≤ 30s |
| AT-032 | Ack de alerta | Usuário vê alerta disparado na UI | Clica "Entendido" | `alert_events.acknowledged_at` atualizado, alerta some do topo |

---

## Parser Reference Suite — 20 exemplos pt-br

> Usada na AT-015 e como few-shot no prompt do Groq. Esperado serializado em `tests/fixtures/parser-suite.json` durante Build.

| # | Input | Expected amount_cents | Expected type | Expected category | Expected merchant | Expected occurred_on |
|---|-------|----------------------|---------------|-------------------|-------------------|---------------------|
| 1 | "20 mercado da maria" | 2000 | expense | Mercado | Mercado da Maria | hoje |
| 2 | "gastei 45 no extra ontem" | 4500 | expense | Mercado | Extra | ontem |
| 3 | "recebi 3500 salário dia 5" | 350000 | income | Renda > Salário | — | dia 5 do mês corrente |
| 4 | "uber 18,40" | 1840 | expense | Transporte > App | Uber | hoje |
| 5 | "ifood 52,90 jantar" | 5290 | expense | Restaurantes > Delivery | iFood | hoje |
| 6 | "netflix 55,90" | 5590 | expense | Assinaturas | Netflix | hoje |
| 7 | "paguei luz 230 no itau" | 23000 | expense | Contas Fixas > Energia | — | hoje (account=Itaú) |
| 8 | "farmácia 87 panvel" | 8700 | expense | Saúde > Farmácia | Panvel | hoje |
| 9 | "recebi 800 freela dia 12" | 80000 | income | Renda > Extra | — | dia 12 do mês corrente |
| 10 | "pix 150 pro joão almoço" | 15000 | expense | Restaurantes | — | hoje |
| 11 | "tirei 200 da carteira" | 20000 | expense | Outros | — | hoje (account=Carteira) |
| 12 | "academia 99,90" | 9990 | expense | Saúde > Academia | — | hoje |
| 13 | "uber eats 38" | 3800 | expense | Restaurantes > Delivery | Uber Eats | hoje |
| 14 | "combustivel 180 shell" | 18000 | expense | Transporte > Combustível | Shell | hoje |
| 15 | "padaria 15,50" | 1550 | expense | Mercado > Padaria | — | hoje |
| 16 | "assinatura spotify 21,90" | 2190 | expense | Assinaturas | Spotify | hoje |
| 17 | "dividendos 127,43" | 12743 | income | Renda > Investimentos | — | hoje |
| 18 | "cinema 60 com a laura" | 6000 | expense | Lazer > Cinema | — | hoje |
| 19 | "curso udemy 29,90" | 2990 | expense | Educação | Udemy | hoje |
| 20 | "gasto em abril: 1200 aluguel" | 120000 | expense | Contas Fixas > Moradia | — | hoje (ou 1º de abril se dia explícito) |

**Regras de parsing:**

- Valor sempre interpretado como BRL; vírgula OU ponto como separador decimal; inteiro sem decimal é reais (não centavos)
- Data relativa ("ontem", "hoje", "dia 5"): resolver em UTC do fuso `America/Sao_Paulo` no momento do parse
- Categoria: match contra lista do usuário + fallback `Outros`; se `parent > child` e filho existir, preferir o mais específico
- Conta: inferir por nome explícito ("no itau"); senão, última usada pelo usuário nas últimas 24h; senão, conta com `sort_order=0`
- Merchant: extrair nome próprio quando presente; deixar `null` quando só há categoria genérica

---

## Categorias Padrão BR — seed inicial

> Seed obrigatório na migration inicial. 10 pais + subcategorias comuns. Usuário pode editar/adicionar/arquivar.

| # | Categoria (pai) | Sub-categorias | is_income |
|---|------------------|-----------------|-----------|
| 1 | **Mercado** | Supermercado, Hortifruti, Padaria | false |
| 2 | **Transporte** | Combustível, App (Uber/99), Transporte Público, Manutenção | false |
| 3 | **Restaurantes** | Delivery, Bar/Café, Restaurante | false |
| 4 | **Contas Fixas** | Moradia, Energia, Água, Internet, Telefone | false |
| 5 | **Saúde** | Farmácia, Plano, Consulta, Academia | false |
| 6 | **Lazer** | Cinema, Viagem, Jogos, Eventos | false |
| 7 | **Educação** | Cursos, Livros, Mensalidade | false |
| 8 | **Assinaturas** | Streaming, Software, Outras | false |
| 9 | **Renda** | Salário, Extra, Investimentos, Reembolso | true |
| 10 | **Outros** | (sem subcategorias; catch-all) | false |

**Regras:**

- Categorias pai vêm com `is_income=false` exceto **Renda** (`true`)
- Filhos herdam `is_income` do pai (regra de UI, não de schema)
- Usuário pode arquivar qualquer uma (`archived_at`); não pode deletar se houver transações — só arquivar
- Primeira seed é per-user (rodada após signup), não global

---

## Out of Scope

Explicitamente NÃO incluídos no MVP:

- **Multi-moeda** — tudo BRL; `currency` column não existe no schema
- **Portfolio / investimentos** (ações, renda fixa, cripto, holdings) — `Renda > Investimentos` é só a entrada do dividendo, não o controle do ativo
- **Contas compartilhadas** (casal, família) — RLS é 1 user por registro; compartilhamento fica pra depois
- **OCR de comprovantes / notas fiscais** — input só texto e voz
- **Recorrência automática** (transações fixas criadas sozinhas) — usuário re-lança; pode-se usar Telegram com atalho
- **Exportação fiscal** (IRPF, DIMOB) — sem relatórios especializados
- **App mobile nativo / PWA** — Next.js responsivo basta; sem manifest PWA no MVP
- **Open Finance / integração direta com bancos** — zero OAuth bancário
- **Metas de budget explícitas** (defina X para Mercado esse mês) — alertas cobrem parte; budgets dedicados ficam pra depois
- **Export CSV** — não bloqueia uso; pode entrar em M3 se sobrar tempo
- **Multi-idioma** — só pt-br; nenhuma estrutura i18n complexa

---

## Constraints

| Type | Constraint | Impact |
|------|------------|--------|
| **Technical** | Stack fixa: Next.js 16 App Router + React 19 + TS + Tailwind v4 + shadcn + Supabase + Groq + Vercel | Mirror do amazing-school-app; zero licença pra trocar framework |
| **Technical** | LLM apenas Groq (llama-3.3-70b + whisper-large-v3) | Sem OpenAI/Anthropic no MVP; prompts devem funcionar no Llama |
| **Technical** | RLS em toda tabela com `user_id` | Policies obrigatórias nas migrations; testes de isolamento obrigatórios |
| **Technical** | `amount_cents BIGINT` em vez de `NUMERIC` | Evita float mas exige conversão consistente em toda boundary (UI, API, LLM) |
| **Linguistic** | UI e prompts 100% pt-br | Nenhuma string em inglês visível ao usuário; validações de i18n em CI |
| **Visual** | Paleta monocromática #FFFFFF→#000000 + verde/vermelho semânticos apenas | Audit visual manual por milestone; nenhum shadcn color primário |
| **Timeline** | Dev solo, 4 milestones ship-ready | Cada M deve ir a produção antes do próximo começar |
| **Resource** | Supabase free tier (500 MB DB, 50k MAU) + Vercel Hobby + Groq free/paid conforme uso | Schema eficiente; `raw_input` não pode inflar; áudios do Telegram não são persistidos, só transcrições |
| **Security** | `telegram_chat_id` vinculado a user via token único de 8 chars com TTL 10 min | Sem bot público anônimo escrevendo no DB |
| **Timezone** | `America/Sao_Paulo` para parsing de datas relativas | `occurred_on` armazenado como `date` (sem timezone); conversão feita na entrada |

---

## Technical Context

| Aspect | Value | Notes |
|--------|-------|-------|
| **Deployment Location** | `app/` (rotas + server actions), `components/`, `lib/` (Groq client, Telegram client, parser), `supabase/migrations/`, `tests/` | Espelha amazing-school-app |
| **KB Domains** | Supabase RLS, Next.js App Router (server actions), Groq structured output, Telegram Bot API (webhooks), shadcn/ui, Recharts | Patterns já validados no amazing-school-app — reaproveitar |
| **IaC Impact** | Novos: projeto Supabase (managed), projeto Vercel, 2 env secrets (Groq API key, Telegram bot token + webhook secret). Nada de Terraform — Supabase CLI + Vercel CLI bastam | Criar projeto Supabase novo; bot do Telegram via BotFather; Vercel link via CLI |

**Directory layout proposto (para /design detalhar):**

```
caixa-forte-app/
├── app/
│   ├── (marketing)/page.tsx            landing
│   ├── (auth)/login/page.tsx
│   ├── (auth)/signup/page.tsx
│   ├── onboarding/page.tsx
│   ├── app/
│   │   ├── layout.tsx                  chrome autenticado
│   │   ├── page.tsx                    dashboard
│   │   ├── transacoes/
│   │   ├── contas/
│   │   ├── categorias/
│   │   ├── chat/
│   │   ├── alertas/
│   │   └── config/
│   └── api/
│       ├── transactions/parse/route.ts
│       ├── telegram/webhook/route.ts
│       ├── chat/stream/route.ts
│       └── cron/evaluate-alerts/route.ts
├── components/
│   ├── ui/                             shadcn primitives
│   ├── transactions/
│   ├── charts/
│   └── chat/
├── lib/
│   ├── supabase/                       clients (server, browser, admin)
│   ├── groq/                           client + parser + prompts (pt-br)
│   ├── telegram/                       client + command handlers
│   ├── parser/                         parseTransaction() unificado
│   └── alerts/                         rule engine + evaluator
├── supabase/
│   └── migrations/                     0001_schema, 0002_rls, 0003_seed_categories, ...
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/                            Playwright (1 smoke por M)
└── scripts/
    └── seed-demo.ts
```

---

## Data Contract

> Aplicável: app é um mini-data-product. Fonte única é o input do usuário (texto, voz, form). Consumidores são as UIs (dashboard, chat, alertas).

### Source Inventory

| Source | Type | Volume | Freshness | Owner |
|--------|------|--------|-----------|-------|
| Web form input | POST `/api/transactions/parse` | ≤ 50/dia por user (estimativa otimista) | Real-time | Leo |
| Telegram webhook | POST `/api/telegram/webhook` | ≤ 50/dia por user | Real-time | Leo |
| Groq Whisper | Transcrição áudio Telegram | ≤ 20/dia por user | Real-time | Groq |

### Schema Contract (tabela principal `transactions`)

| Column | Type | Constraints | PII? |
|--------|------|-------------|------|
| id | uuid | PK, default gen_random_uuid() | No |
| user_id | uuid | NOT NULL, FK auth.users | No (é o ID) |
| account_id | uuid | NOT NULL, FK accounts | No |
| category_id | uuid | NULL, FK categories | No |
| type | text | CHECK (income\|expense), NOT NULL | No |
| amount_cents | bigint | NOT NULL, CHECK > 0 | **Yes (valor financeiro)** |
| occurred_on | date | NOT NULL | No |
| merchant | text | NULL | Maybe (nome de estabelecimento local) |
| note | text | NULL | **Yes (pode conter info pessoal)** |
| source | text | CHECK (web\|telegram_text\|telegram_voice\|manual), NOT NULL | No |
| raw_input | text | NULL | **Yes (voz/texto livre do user)** |
| groq_parse_json | jsonb | NULL | No |
| groq_confidence | numeric(3,2) | NULL | No |
| needs_review | boolean | GENERATED AS (groq_confidence < 0.70) STORED | No |
| created_at | timestamptz | default now() | No |
| updated_at | timestamptz | NULL | No |

**PII handling:** `raw_input`, `note`, `amount_cents` e `merchant` são sensíveis. RLS isola por user. Logs de aplicação nunca logam `raw_input` completo; apenas comprimento + hash.

### Freshness SLAs

| Layer | Target | Measurement |
|-------|--------|-------------|
| Insert (web) | P95 ≤ 3s Enter→DB | Timestamp do front vs `created_at` |
| Insert (Telegram texto) | P95 ≤ 4s | Telegram timestamp vs `created_at` |
| Insert (Telegram voz) | P95 ≤ 8s (inclui Whisper) | Telegram timestamp vs `created_at` |
| Dashboard read | P95 ≤ 2s até First Meaningful Paint | Web Vitals |
| Alertas | Diário, janela de 24h | `alerts.last_evaluated_at` dentro de 24h |

### Completeness Metrics

- 100% das transações têm `user_id`, `account_id`, `type`, `amount_cents`, `occurred_on`, `source` (NOT NULL enforcement no schema)
- `category_id` pode ser NULL (parser falhou) — UI trata explicitamente com "Sem categoria"
- `raw_input` presente quando `source IN (web, telegram_*)`; NULL quando `source=manual`
- Suite de 20 exemplos com acurácia ≥ 85% como gate de release do M2

### Lineage Requirements

- `raw_input` → `groq_parse_json` → colunas normalizadas — permite re-parse quando prompt evoluir
- Migration de re-parse documentada (job batch que relê `raw_input`, chama parser novo, atualiza colunas sem perder histórico)

---

## Assumptions

| ID | Assumption | If Wrong, Impact | Validated? |
|----|------------|------------------|------------|
| A-001 | Groq llama-3.3-70b acerta ≥ 85% categoria em pt-br com few-shot de 20 exemplos | Precisaria modelo maior (70b→405b) ou prompt mais rico, aumentando latência e custo | [ ] — valida em M2 com suite |
| A-002 | Whisper-large-v3 transcreve pt-br de áudios Telegram (< 30s, ambiente normal) com WER aceitável | Precisaria pré-processamento de áudio ou modelo alternativo | [ ] — valida em M2 |
| A-003 | Supabase free tier (500 MB, 50k MAU) cobre MVP + primeiros usuários | Migrate para Pro (~$25/mo) quando ultrapassar; não bloqueia ship | [x] — confirmado em amazing-school-app |
| A-004 | Vercel free tier (100 GB bandwidth) cobre o tráfego | Upgrade ou Cloudflare na frente | [x] — confirmado |
| A-005 | Usuários têm Telegram instalado e aceitam vincular via token de 8 chars | Web continua funcionando; Telegram vira opcional | [x] — aceitável, Telegram é brinde |
| A-006 | Categorias padrão BR cobrem 90% dos lançamentos comuns | Usuário edita no onboarding; atrito baixo | [ ] — valida em uso real |
| A-007 | 10k transações por user é teto realista do MVP (≥ 13 anos a 2/dia) | Precisa paginação + virtualização na lista; índices já estão | [x] — aceitável |
| A-008 | `amount_cents BIGINT` suporta valores até R$ 92 quatrilhões | Nunca será atingido | [x] — óbvio |
| A-009 | Cron Vercel (1x/dia) é suficiente para alertas no MVP | Se precisar real-time, migra para trigger em insert | [ ] — valida uso real |
| A-010 | Usuário está em `America/Sao_Paulo`; não precisa timezone configurável | Se tiver users em outro fuso, adiciona `profiles.timezone` | [ ] — valida em M2 |

**Ações pré-Design:** A-001 e A-002 devem ser validadas com smoke test no Groq Playground antes do design do parser. A-006 é validada no próprio uso.

---

## Milestones — Acceptance Criteria Consolidada

| M | Gate de release (tudo deve passar) |
|---|-----------------------------------|
| **M1 Foundation** | AT-001 a AT-005 + deploy Vercel + Supabase migration aplicada em prod + smoke e2e Playwright (signup → criar tx → ver no dashboard) |
| **M2 Smart Capture** | AT-010 a AT-015 + webhook Telegram configurado (BotFather + secret) + suite de 20 exemplos ≥ 85% + smoke e2e "digito no web → aparece" |
| **M3 Insights** | AT-020 a AT-024 + gráficos acessíveis (tooltip pt-br, navegação por teclado) + smoke e2e "pergunto no chat → recebo número correto" |
| **M4 Alertas** | AT-030 a AT-032 + cron Vercel `/api/cron/evaluate-alerts` agendado + smoke e2e "crio regra → forço evento → vejo notificação" |

---

## Clarity Score Breakdown

| Element | Score (0-3) | Notes |
|---------|-------------|-------|
| Problem | 3 | Claro: registro demorado + categorização manual em apps BR existentes; solução é voz/texto + LLM. Especifica perfil do usuário e pain point. |
| Users | 3 | 3 personas com pain points distintos; proto-usuário definido (Leo) permite validação rápida. |
| Goals | 3 | 10 goals priorizados MUST/SHOULD/COULD alinhados com 4 milestones. |
| Success | 3 | 10 critérios mensuráveis com números (< 5s, ≥ 85%, P95 ≤ 3s, 0 vazamentos RLS, etc.). |
| Scope | 3 | 11 itens explícitos em Out of Scope; 20 exemplos few-shot definem exatamente o que o parser deve acertar. |
| **Total** | **15/15** | Pronto para Design. |

---

## Open Questions

**Nenhuma bloqueante.** Itens para validar durante o Design / Build (não bloqueantes):

1. Qual dos modelos Groq Whisper específicos (`whisper-large-v3` vs `whisper-large-v3-turbo`) dá melhor trade-off latência/acurácia em pt-br? — valida em M2 com suite de áudio.
2. Llama 3.3 70b vs 3.1 8b-instant para parsing simples: vale a latência mais baixa do 8b se acurácia cair? — benchmark em M2.
3. Qual lib de charts (Recharts vs Visx) casa melhor com paleta monocromática + acessibilidade? — definido em M3.
4. Formato do token de vínculo Telegram: `/start <token>` ou fluxo OAuth-like? — definido em M2.

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-04-22 | define-agent | Versão inicial extraída de BRAINSTORM_CAIXA_FORTE.md. Inclui suite de 20 exemplos pt-br, 10 categorias padrão BR, acceptance criteria por milestone. |

---

## Next Step

**Ready for:** `/agentspec:workflow:design .claude/sdd/features/DEFINE_CAIXA_FORTE.md`

A fase Design vai:

1. Arquitetura detalhada por camada (app/, lib/, supabase/) com diagramas
2. Contratos de API (/api/transactions/parse, /api/telegram/webhook, /api/chat/stream, /api/cron/evaluate-alerts)
3. Prompt engineering para `parseTransaction()` com os 20 few-shot exemplos
4. Motor de regras de alertas (estrutura do `rule_json` + avaliador)
5. Decomposição em tasks ordenáveis por milestone (entrada de `/build`)
6. Escolha final de lib de charts + spec visual dos componentes (KPI cards, lista, pizza, linha)
