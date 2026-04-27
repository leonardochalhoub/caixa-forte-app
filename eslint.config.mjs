// ESLint 9+ flat config — substitui o legacy .eslintrc.json.
// Conselho v4 (eng-software, finanças): "Lint quebrado = drift de
// estilo em refactors massivos sem rede."
//
// FlatCompat falhou com circular reference no plugin react (bug conhecido
// Next 16 + ESLint v9). Solução: flat puro com typescript-eslint +
// @next/eslint-plugin-next direto, sem o preset clássico.

import tseslint from "typescript-eslint"
import nextPlugin from "@next/eslint-plugin-next"

export default tseslint.config(
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "dist/**",
      "build/**",
      "playwright-report/**",
      "test-results/**",
      "scripts/**",
      "supabase/migrations/**",
      "lib/supabase/database.types.ts",
      "tests/e2e/**",
    ],
  },
  ...tseslint.configs.recommended,
  {
    plugins: {
      "@next/next": nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      // Permite require() em arquivos de migration scripts e testes
      "@typescript-eslint/no-require-imports": "off",
    },
  },
)
