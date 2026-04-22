"use client"

import { useEffect, useState } from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!mounted) {
    return <span className="inline-block h-9 w-9" aria-hidden />
  }

  const isDark = resolvedTheme === "dark"

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Ativar modo claro" : "Ativar modo escuro"}
    >
      {isDark ? <Sun aria-hidden /> : <Moon aria-hidden />}
    </Button>
  )
}
