import Link from "next/link"
import { Footer } from "@/components/footer"
import { ThemeToggle } from "@/components/theme-toggle"

// /login, /signup, /esqueci-senha, /redefinir-senha NUNCA redirecionam
// usuários já logados. O login form sobrescreve cookies. Quem quer
// voltar pra app clica no botão dentro do form (componente faz isso
// quando detecta sessão ativa).
export const dynamic = "force-dynamic"
export const revalidate = 0

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="flex h-16 items-center justify-between border-b border-border px-6">
        <Link href="/" className="flex items-baseline gap-2 tracking-tight text-ink">
          <span className="font-semibold">Caixa Forte</span>
          <span className="hidden text-muted sm:inline">—</span>
          <span className="hidden font-serif text-sm italic text-muted sm:inline">
            É preto no branco!
          </span>
        </Link>
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-center justify-center px-6 py-12">{children}</main>
      <Footer />
    </div>
  )
}
