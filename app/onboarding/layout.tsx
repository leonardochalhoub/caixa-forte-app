import Link from "next/link"
import { Footer } from "@/components/footer"
import { ThemeToggle } from "@/components/theme-toggle"

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
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
