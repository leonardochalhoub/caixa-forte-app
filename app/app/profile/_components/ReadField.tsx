export function ReadField({
  label,
  value,
  muted,
}: {
  label: string
  value: string
  muted?: boolean
}) {
  return (
    <div className="space-y-0.5">
      <dt className="text-[10px] uppercase tracking-[0.2em] text-muted">{label}</dt>
      <dd className={muted ? "text-muted" : "font-medium text-strong"}>{value}</dd>
    </div>
  )
}
