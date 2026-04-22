import Link from "next/link"
import { PrivacyDisclaimer } from "@/components/PrivacyDisclaimer"
import { SignupForm } from "./_form"

export default function SignupPage() {
  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Criar conta</h1>
        <p className="text-sm text-muted">Email, senha e sua cidade.</p>
      </div>
      <SignupForm />
      <PrivacyDisclaimer />
      <p className="text-center text-sm text-muted">
        Já tem conta?{" "}
        <Link href="/login" className="text-strong underline underline-offset-4">
          Entrar
        </Link>
      </p>
    </div>
  )
}
