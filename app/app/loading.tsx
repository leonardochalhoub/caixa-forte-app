export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="h-7 w-48 animate-pulse rounded bg-subtle" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-2xl border border-border bg-subtle"
          />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-2xl border border-border bg-subtle" />
    </div>
  )
}
