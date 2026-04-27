export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="h-7 w-40 animate-pulse rounded bg-subtle" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-32 animate-pulse rounded-2xl border border-border bg-subtle"
          />
        ))}
      </div>
    </div>
  )
}
