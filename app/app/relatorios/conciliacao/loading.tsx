export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-64 animate-pulse rounded bg-subtle" />
      <div className="h-12 animate-pulse rounded bg-subtle" />
      <div className="h-72 animate-pulse rounded-xl border border-border bg-subtle" />
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded border border-border bg-subtle"
          />
        ))}
      </div>
    </div>
  )
}
