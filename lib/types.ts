// Narrow unions not inferrable from CHECK constraints by `supabase gen types`.
// Kept separate so re-running `npm run db:types` doesn't overwrite them.
// Runtime safety: Postgres CHECKs enforce these; reads are safely cast.

export type AccountType =
  | "checking"
  | "credit"
  | "cash"
  | "wallet"
  | "savings"
  | "investment"
  | "poupanca"
  | "crypto"
  | "fgts"
export type TransactionType = "income" | "expense"
export type TransactionSource = "web" | "telegram_text" | "telegram_voice" | "manual"
export type MessageRole = "user" | "assistant" | "tool"
export type Channel = "web" | "telegram"
