const MESSAGES: Record<string, string> = {
  "invalid login credentials": "Email ou senha incorretos.",
  "invalid credentials": "Email ou senha incorretos.",
  "email not confirmed": "Confirme seu email antes de entrar — veja sua caixa de entrada.",
  "user already registered": "Esse email já está cadastrado. Tenta fazer login.",
  "user not found": "Não encontramos essa conta.",
  "password should be at least 6 characters":
    "Senha muito curta — use pelo menos 8 caracteres.",
  "password is too weak": "Senha muito fraca — use pelo menos 8 caracteres.",
  "new password should be different from the old password":
    "A nova senha precisa ser diferente da anterior.",
  "email rate limit exceeded":
    "Muitas tentativas. Espera alguns minutos antes de tentar de novo.",
  "signup requires a valid password": "Digite uma senha válida.",
  "signups not allowed for this instance":
    "Cadastro temporariamente desativado. Fala com o admin.",
}

export function translateAuthError(message: string | undefined | null): string {
  if (!message) return "Algo deu errado. Tenta de novo."
  const normalized = message.toLowerCase().trim()
  for (const [key, pt] of Object.entries(MESSAGES)) {
    if (normalized.includes(key)) return pt
  }
  return message
}
