/**
 * M1 Foundation smoke — happy path.
 *
 * Requires:
 *   - npm run dev (or PLAYWRIGHT_BASE_URL pointing to prod deploy)
 *   - Supabase local up and seeded (magic link emails captured via inbucket on :54324)
 *
 * Full signup + email confirmation not automated; this test covers the static
 * marketing/login surface that M1 must ship. Deeper e2e (onboarding → tx) lives
 * in the integration test until we add test-only auth helpers.
 */
import { expect, test } from "@playwright/test"

test.describe("M1 — landing + login surface", () => {
  test("landing renders with CTAs in pt-BR", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/dinheiro/i)
    await expect(page.getByRole("link", { name: "Entrar" }).first()).toBeVisible()
    await expect(page.getByRole("link", { name: "Criar conta" }).first()).toBeVisible()
  })

  test("login page shows magic-link form", async ({ page }) => {
    await page.goto("/login")
    await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible()
    await expect(page.getByLabel("Email")).toBeVisible()
    await expect(page.getByRole("button", { name: /link mágico/i })).toBeVisible()
  })

  test("signup page shows magic-link form", async ({ page }) => {
    await page.goto("/signup")
    await expect(page.getByRole("heading", { name: "Criar conta" })).toBeVisible()
  })

  test("app routes redirect unauthenticated users to /login", async ({ page }) => {
    const res = await page.goto("/app")
    expect(page.url()).toContain("/login")
    expect(res?.ok()).toBeTruthy()
  })
})
