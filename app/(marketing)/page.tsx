import Image from "next/image"
import Link from "next/link"
import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Footer } from "@/components/footer"
import { DocsButton } from "@/components/DocsButton"
import { PrivacyDisclaimer } from "@/components/PrivacyDisclaimer"
import { SafeBoxIcon } from "@/components/SafeBoxIcon"
import { ThemeToggle } from "@/components/theme-toggle"

// deploy nudge
export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="flex h-16 items-center justify-between border-b border-border px-6">
        <div className="flex items-center gap-2 tracking-tight text-ink">
          <SafeBoxIcon size={22} strokeWidth={1.75} className="text-strong" />
          <span className="font-semibold">Caixa Forte</span>
          <span className="hidden text-muted sm:inline">—</span>
          <span className="hidden font-serif text-sm italic text-muted sm:inline">
            É preto no branco!
          </span>
        </div>
        <nav className="flex items-center gap-1">
          <Button variant="ghost" asChild>
            <Link href="/login">Entrar</Link>
          </Button>
          <Button asChild>
            <Link href="/signup">Criar conta</Link>
          </Button>
          <ThemeToggle />
        </nav>
      </header>

      <section className="mx-auto w-full max-w-2xl space-y-2 px-6 pt-10">
        {/* <a> nativo (não <Link>): /api/demo/enter é Route Handler que
            faz signin + redirect 303. Next.js Link às vezes intercepta
            como client-nav e ignora target=_blank em determinadas
            condições; <a> garante que o browser abra nova tab
            corretamente. */}
        <a
          href="/api/demo/enter"
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center gap-4 rounded-2xl border border-border bg-subtle/40 p-4 transition-colors hover:border-strong/30 hover:bg-subtle"
        >
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-border">
            <Image
              src="https://randomuser.me/api/portraits/women/79.jpg"
              alt="Foto pública aleatória usada como avatar da conta fictícia"
              width={64}
              height={64}
              unoptimized
              className="h-full w-full object-cover"
            />
          </div>
          <div className="flex-1 space-y-0.5">
            <p className="text-[10px] uppercase tracking-wider text-muted">
              Ver conta de exemplo · 100% fictícia
            </p>
            <p className="text-base font-medium text-strong">
              Larissa Oliveira · São Paulo
            </p>
            <p className="text-xs text-body">
              Explore o app como se fosse uma usuária real: 16 meses de
              transações, cartões, investimentos, FGTS e um carro financiado.
            </p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-strong" />
        </a>
        <p className="px-1 text-[11px] leading-relaxed text-muted">
          <strong className="font-semibold text-body">Aviso:</strong>{" "}
          Larissa Oliveira não existe. Nome, transações, saldos, cartões e
          carro foram inventados por IA (Llama 3.3 via Groq) para fins de
          demonstração. A foto vem de um banco público e aleatório da
          internet (
          <a
            href="https://randomuser.me"
            target="_blank"
            rel="noopener"
            className="underline"
          >
            randomuser.me
          </a>
          ) — não corresponde a nenhuma pessoa real associada ao Caixa Forte.
          Nenhum dado seu é usado ou exposto nessa conta.
        </p>
      </section>

      <section className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-20 text-center">
        <div className="flex flex-col items-center gap-3">
          <h1 className="max-w-3xl text-5xl font-semibold tracking-tight text-ink md:text-7xl">
            Caixa Forte
          </h1>
          <p className="font-serif text-xl italic text-muted md:text-2xl">
            É preto no branco!
          </p>
        </div>

        <div className="my-2 h-px w-24 bg-border" />

        <h2 className="max-w-3xl text-3xl font-semibold tracking-tight text-strong md:text-5xl">
          Seu dinheiro,
          <br />
          <span className="inline-flex items-center gap-2">
            <ArrowUp className="h-10 w-10 text-income md:h-12 md:w-12" aria-hidden />
            no controle
            <ArrowDown className="h-10 w-10 text-expense md:h-12 md:w-12" aria-hidden />
          </span>
        </h2>
        <p className="max-w-xl text-lg text-body">
          Registre ganhos e gastos em segundos. Fale no Telegram, digite no navegador, e veja seu
          dinheiro num só lugar — sem planilhas, sem fricção.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button size="lg" asChild>
            <Link href="/signup">Começar grátis</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/login">Já tenho conta</Link>
          </Button>
          <DocsButton source="main" size="lg" label="Documentação" />
        </div>
      </section>

      <section className="mx-auto w-full max-w-2xl px-6 pb-16">
        <PrivacyDisclaimer />
      </section>

      <Footer />
    </div>
  )
}
