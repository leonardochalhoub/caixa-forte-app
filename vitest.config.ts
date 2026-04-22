import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.spec.ts", "tests/integration/**/*.spec.ts"],
    exclude: ["tests/e2e/**", "node_modules/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["lib/**/*.ts"],
      exclude: ["lib/supabase/database.types.ts"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
})
