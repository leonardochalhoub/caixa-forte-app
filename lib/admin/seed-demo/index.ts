import { createClient } from "@supabase/supabase-js"
import { seedAccounts } from "./accounts"
import {
  ensureDemoAuthUser,
  upsertDemoProfile,
  wipeDemoData,
} from "./auth-user"
import { seedBalanceAdjustments, seedBalanceRegistries } from "./balance"
import { seedCategories } from "./categories"
import { seedTransactions } from "./transactions"
import type { RangeKey, SeedLog } from "./types"
import { CITIES, makeRng, monthsForRange } from "./utils"

export type { RangeKey, SeedLog } from "./types"

export type SeedDemoResult = {
  userId: string
  city: string
  logs: SeedLog[]
}

// Orquestra o seed completo da Larissa demo: ensure auth user, upsert
// profile, wipe, accounts, categories, transações por mês, ajustes e
// registries de partida-dobrada. Lança se faltar env var ou der erro
// fatal — caller deve embrulhar em try/catch e formatar response.
export async function seedDemoUser(range: RangeKey): Promise<SeedDemoResult> {
  const logs: SeedLog[] = []
  const note = (step: string, detail: string, ok = true) =>
    logs.push({ step, detail, ok })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !svcKey) {
    throw new Error("Variáveis de ambiente ausentes.")
  }
  const sb = createClient(url, svcKey, { auth: { persistSession: false } })

  // --- Seed global: baseado em timestamp pra cada re-seed ter variedade ---
  const globalSeed = Date.now() & 0xffffffff
  const r = makeRng(globalSeed)
  const picked = CITIES[Math.floor(r() * CITIES.length)]!

  // --- AUTH USER ---
  const userId = await ensureDemoAuthUser(sb, note)

  // --- PROFILE com cidade aleatória ---
  await upsertDemoProfile(sb, userId, picked, note)

  // --- WIPE ---
  await wipeDemoData(sb, userId, note)

  // --- ACCOUNTS ---
  const { accountsByName, count: accCount } = await seedAccounts(sb, userId)
  note("accounts", `${accCount} inseridas`)

  // --- CATEGORIES ---
  const { categoriesByName, count: catCount } = await seedCategories(
    sb,
    userId,
  )
  note("categories", `${catCount} inseridas`)

  // --- TRANSACTIONS ---
  const months = monthsForRange(range)
  note("range", `${range} → ${months.length} meses`)
  const { inserted, total } = await seedTransactions(
    sb,
    userId,
    months,
    accountsByName,
    categoriesByName,
    r,
    note,
  )
  note("transactions", `${inserted}/${total} inseridas`)

  // --- BALANCE ADJUSTMENTS ---
  await seedBalanceAdjustments(sb, userId, note)

  // --- BALANCE REGISTRIES ---
  await seedBalanceRegistries(sb, userId, note)

  return { userId, city: picked.city, logs }
}
