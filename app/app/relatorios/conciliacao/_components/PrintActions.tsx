"use client"

import { FileDown, Printer } from "lucide-react"

export function PrintActions({
  rows,
  filename,
  sheetName = "Conciliação",
}: {
  rows: (string | number)[][]
  filename: string
  sheetName?: string
}) {
  // xlsx é ~900KB minified — lazy-load só no clique pra não inflar o
  // bundle inicial das páginas de relatório.
  async function downloadXlsx() {
    const XLSX = await import("xlsx")
    const ws = XLSX.utils.aoa_to_sheet(rows)
    const colWidths = rows[0]?.map((_, colIdx) => {
      const maxLen = Math.max(
        ...rows.map((r) => {
          const cell = r[colIdx]
          return cell == null ? 0 : String(cell).length
        }),
      )
      return { wch: Math.min(Math.max(maxLen + 2, 10), 48) }
    })
    if (colWidths) ws["!cols"] = colWidths
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
    XLSX.writeFile(wb, filename, { bookType: "xlsx" })
  }

  function openPrint() {
    setTimeout(() => {
      if (typeof window !== "undefined" && typeof window.print === "function") {
        window.print()
      }
    }, 0)
  }

  const btnClass =
    "inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-border bg-canvas px-3 text-sm font-medium text-strong transition-colors hover:bg-subtle hover:border-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-strong"

  return (
    <div className="flex gap-2">
      <button type="button" className={btnClass} onClick={downloadXlsx}>
        <FileDown className="h-3.5 w-3.5" />
        Exportar XLSX
      </button>
      <button type="button" className={btnClass} onClick={openPrint}>
        <Printer className="h-3.5 w-3.5" />
        Imprimir / Salvar PDF
      </button>
    </div>
  )
}
