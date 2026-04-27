import type { ActivityRow, LoginEvent, UserRow } from "./types"

export function buildActivityRows(
  rows: UserRow[],
  events: LoginEvent[],
): ActivityRow[] {
  // events already arrive sorted DESC by happened_at — first occurrence per
  // user_id wins, which is exactly the latest event for that user.
  const latest = new Map<string, LoginEvent>()
  for (const e of events) {
    if (!latest.has(e.user_id)) latest.set(e.user_id, e)
  }
  return [...rows]
    .map((r) => {
      const e = latest.get(r.user_id)
      return {
        ...r,
        last_at: e?.happened_at ?? r.last_login_at,
        last_ip: e?.ip ?? null,
        last_ua: e?.user_agent ?? null,
      }
    })
    .sort((a, b) => {
      const aT = a.last_at ? new Date(a.last_at).getTime() : 0
      const bT = b.last_at ? new Date(b.last_at).getTime() : 0
      return bT - aT
    })
}

export function formatIsoToLocal(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return iso
  }
}

export function shortUA(ua: string | null): string {
  if (!ua) return "—"
  const chrome = ua.match(/Chrome\/([0-9.]+)/)?.[1]
  const firefox = ua.match(/Firefox\/([0-9.]+)/)?.[1]
  const safari = ua.match(/Version\/([0-9.]+).*Safari/)?.[1]
  if (chrome) return `Chrome ${chrome.split(".")[0]}`
  if (firefox) return `Firefox ${firefox.split(".")[0]}`
  if (safari) return `Safari ${safari.split(".")[0]}`
  return ua.slice(0, 40)
}
