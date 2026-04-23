import type { SVGProps } from "react"

/**
 * Ícone minimalista do Caixa Forte — caixa-forte (safe box) com dial
 * no centro e alça do lado direito. Usa currentColor pra se adaptar
 * ao tema (preto no light, branco no dark). Stroke fino, estética tech
 * coerente com o resto da UI monocromática.
 */
export function SafeBoxIcon({
  size = 20,
  strokeWidth = 1.75,
  ...rest
}: SVGProps<SVGSVGElement> & { size?: number; strokeWidth?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <rect x="3" y="4" width="26" height="24" rx="3.5" />
      <circle cx="16" cy="16" r="4.5" />
      <line x1="16" y1="16" x2="19" y2="13" />
      <line x1="25" y1="20" x2="25" y2="23" />
    </svg>
  )
}
