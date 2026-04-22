import Link from "next/link"
import { ForgotPasswordForm } from "./_form"

export default function EsqueciSenhaPage() {
  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Recuperar senha</h1>
        <p className="text-sm text-muted">
          Digite seu email e te enviamos um link para definir uma nova senha.
        </p>
      </div>
      <ForgotPasswordForm />
      <p className="text-center text-sm text-muted">
        Lembrou?{" "}
        <Link href="/login" className="text-strong underline underline-offset-4">
          Voltar pro login
        </Link>
      </p>
    </div>
  )
}
