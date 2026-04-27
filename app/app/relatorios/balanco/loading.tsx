export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-64 animate-pulse rounded bg-subtle" />
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-xl border border-border bg-subtle"
          />
        ))}
      </div>
      <div className="h-96 animate-pulse rounded-xl border border-border bg-subtle" />
    </div>
  )
}
