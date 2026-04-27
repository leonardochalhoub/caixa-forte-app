export interface UserRow {
  user_id: string
  email: string | null
  display_name: string | null
  role: string
  city_name: string | null
  uf: string | null
  onboarded_at: string | null
  created_at: string
  last_login_at: string | null
  login_count: number
}

export interface LoginEvent {
  id: number
  user_id: string
  happened_at: string
  ip: string | null
  user_agent: string | null
}

export type TrendDirection = "rising" | "falling" | "flat"

export interface Kpi {
  totalUsers: number
  onboardedUsers: number
  avgBalanceCents: number
  medianBalanceCents: number
  trendDirection: TrendDirection
  formattedAvg: string
  formattedMedian: string
  trend1m: { net: number; direction: TrendDirection; why?: string }
  trend6m: { net: number; direction: TrendDirection; why?: string }
  trend12m: { net: number; direction: TrendDirection; why?: string }
  demoClicks: {
    total: number
    last24h: number
    last7d: number
    uniqueIps: number
  }
}

export type ActivityRow = UserRow & {
  last_at: string | null
  last_ip: string | null
  last_ua: string | null
}
