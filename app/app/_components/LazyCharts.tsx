"use client"

import dynamic from "next/dynamic"
import type { MonthlyTotals } from "@/lib/analytics/periods"

// Conselho v4 (vercel-perf): "Recharts síncrono é ~95KB no bundle inicial.
// next/dynamic com ssr:false carrega só no client após hydration."
//
// Wrapper Client Component pra Server Components do dashboard usarem
// next/dynamic (que não funciona direto em RSC). Loading state preserva
// altura pra evitar layout shift.

const ChartSkeleton = () => (
  <div className="h-56 w-full animate-pulse rounded-lg bg-subtle" />
)

export const TrendStripLazy = dynamic(
  () => import("./TrendStrip").then((m) => ({ default: m.TrendStrip })),
  { ssr: false, loading: ChartSkeleton },
) as React.ComponentType<{ data: MonthlyTotals[] }>

export const PatrimonyTrendLazy = dynamic(
  () => import("./PatrimonyTrend").then((m) => ({ default: m.PatrimonyTrend })),
  { ssr: false, loading: ChartSkeleton },
) as React.ComponentType<{ data: Array<{ date: string; totalCents: number }> }>
