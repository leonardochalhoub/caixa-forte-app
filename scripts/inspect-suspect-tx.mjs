#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=")
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const UID = "bd54cb8e-9405-4a12-9230-b83fb25f4d48"

const { data: acc } = await sb
  .from("accounts")
  .select("id")
  .eq("user_id", UID)
  .eq("name", "Nubank Renda Fixa")
  .maybeSingle()

const { data: txs } = await sb
  .from("transactions")
  .select("id, type, amount_cents, occurred_on, merchant, note, raw_input, source, groq_parse_json, category_id")
  .eq("user_id", UID)
  .eq("account_id", acc.id)
  .order("occurred_on", { ascending: true })

const { data: cats } = await sb
  .from("categories")
  .select("id, name, parent_id")
  .eq("user_id", UID)
const catMap = new Map((cats ?? []).map((c) => [c.id, c.name]))

const brl = (c) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

for (const t of txs ?? []) {
  console.log("─".repeat(70))
  console.log(`id          ${t.id}`)
  console.log(`${t.occurred_on}  ${t.type === "income" ? "+" : "-"}${brl(t.amount_cents)}`)
  console.log(`merchant    ${t.merchant ?? "(vazio)"}`)
  console.log(`category    ${t.category_id ? (catMap.get(t.category_id) ?? "(desc)") : "(vazio)"}`)
  console.log(`source      ${t.source}`)
  console.log(`raw_input   ${t.raw_input ?? "(vazio)"}`)
  console.log(`note        ${t.note ?? "(vazio)"}`)
  if (t.groq_parse_json) {
    const j = t.groq_parse_json
    console.log(`groq.account_hint  ${j.account_hint ?? "(vazio)"}`)
    console.log(`groq.confidence    ${j.confidence ?? "?"}`)
  }
}
