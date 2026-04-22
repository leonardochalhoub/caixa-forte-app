import { ResetPasswordForm } from "./_form"

export default function RedefinirSenhaPage() {
  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Nova senha</h1>
        <p className="text-sm text-muted">Defina uma senha para sua conta.</p>
      </div>
      <ResetPasswordForm />
    </div>
  )
}
