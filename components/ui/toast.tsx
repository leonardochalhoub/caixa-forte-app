"use client"

import { Toaster as SonnerToaster } from "sonner"

export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      toastOptions={{
        classNames: {
          toast: "bg-canvas border border-border shadow-sm rounded-lg p-4 text-sm text-strong",
          title: "text-strong font-medium",
          description: "text-muted",
          success: "text-income",
          error: "text-expense",
        },
      }}
    />
  )
}

export { toast } from "sonner"
