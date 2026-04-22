"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const BASE_NAV = [
  { href: "/app", label: "Início" },
  { href: "/app/contas", label: "Contas" },
  { href: "/app/categorias", label: "Categorias" },
] as const

export function AppNav({ showSysadmin = false }: { showSysadmin?: boolean }) {
  const pathname = usePathname() ?? ""

  const items = showSysadmin
    ? [...BASE_NAV, { href: "/app/sysadmin", label: "Sysadm" }]
    : BASE_NAV

  return (
    <nav className="flex items-center justify-center gap-1 overflow-x-auto px-4 py-2 [scrollbar-width:none] md:gap-2 md:py-0 [&::-webkit-scrollbar]:hidden">
      {items.map((item) => {
        const active =
          item.href === "/app"
            ? pathname === "/app"
            : pathname === item.href || pathname.startsWith(`${item.href}/`)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition-colors",
              active
                ? "bg-strong text-canvas font-medium"
                : "text-body hover:bg-subtle hover:text-strong",
            )}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
