// Skeleton padrão pros relatórios — exibido enquanto Server Components
// fazem suas queries. Reutiliza o mesmo grid pra reduzir flicker visual.
export default function ReportsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 rounded bg-subtle" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl border border-border bg-canvas" />
        ))}
      </div>
      <div className="h-72 rounded-xl border border-border bg-canvas" />
    </div>
  )
}
