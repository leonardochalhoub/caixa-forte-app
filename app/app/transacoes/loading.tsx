export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="h-7 w-40 animate-pulse rounded bg-subtle" />
      <div className="h-12 animate-pulse rounded bg-subtle" />
      <div className="space-y-2">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div
            key={i}
            className="h-14 animate-pulse rounded border border-border bg-subtle"
          />
        ))}
      </div>
    </div>
  )
}
