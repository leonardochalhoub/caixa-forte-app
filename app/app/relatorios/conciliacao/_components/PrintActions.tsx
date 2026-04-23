"use client"

import { FileDown, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"

export function PrintActions({
  csvContent,
  filename,
}: {
  csvContent: string
  filename: string
}) {
  function downloadCsv() {
    // BOM + CRLF so Excel abre sem quebrar acentos e planilhas trata colunas direito
    const blob = new Blob(["﻿" + csvContent.replace(/\n/g, "\r\n")], {
      type: "text/csv;charset=utf-8;",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" className="gap-1.5" onClick={downloadCsv}>
        <FileDown className="h-3.5 w-3.5" />
        Exportar CSV
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => window.print()}
      >
        <Printer className="h-3.5 w-3.5" />
        Imprimir / Salvar PDF
      </Button>
    </div>
  )
}
