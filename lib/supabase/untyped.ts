import type { SupabaseClient } from "@supabase/supabase-js"

// Escape hatch for tables/columns that exist in the live database but aren't
// yet in the generated `Database` type. Use sparingly, only for fields added
// by migrations that haven't been reflected in `lib/supabase/database.types.ts`
// yet. Regenerating types with `npm run db:types` will remove the need.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function untyped(client: SupabaseClient<never>): any {
  return client as unknown
}
