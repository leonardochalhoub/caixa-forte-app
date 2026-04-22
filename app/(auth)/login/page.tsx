import Link from "next/link"
import { LoginForm } from "./_form"

export default function LoginPage() {
  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Entrar</h1>
        <p className="text-sm text-muted">Bem-vindo de volta.</p>
      </div>
      <LoginForm />
      <p className="text-center text-sm text-muted">
        Não tem conta?{" "}
        <Link href="/signup" className="text-strong underline underline-offset-4">
          Criar agora
        </Link>
      </p>
    </div>
  )
}
