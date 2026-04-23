"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"

export function ThemeToggle({ current }: { current: "claro" | "escuro" }) {
  const router = useRouter()
  const params = useSearchParams()

  function toggle() {
    const q = new URLSearchParams(params?.toString() ?? "")
    if (current === "escuro") q.delete("tema")
    else q.set("tema", "escuro")
    router.push(`?${q.toString()}`)
  }

  return (
    <Button variant="outline" size="sm" className="gap-1.5" onClick={toggle}>
      {current === "escuro" ? (
        <>
          <Sun className="h-3.5 w-3.5" />
          Tema claro
        </>
      ) : (
        <>
          <Moon className="h-3.5 w-3.5" />
          Tema escuro
        </>
      )}
    </Button>
  )
}
