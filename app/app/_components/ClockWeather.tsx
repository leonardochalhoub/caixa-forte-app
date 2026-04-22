"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudRain,
  CloudSnow,
  MapPin,
  Sun,
  Zap,
} from "lucide-react"
import {
  conditionLabelPtBr,
  fetchWeather,
  type DailyForecast,
  type WeatherCondition,
  type WeatherResponse,
} from "@/lib/weather"

interface Props {
  cityName: string | null
  uf: string | null
  coords: { lat: number; lng: number } | null
  compact?: boolean
}

// Business-like clock + 3-day weather strip for the user dashboard. Matches
// the monochrome palette of the rest of the app; weather icons are the only
// splash of meaning-bearing color.

export function ClockWeather({ cityName, uf, coords, compact }: Props) {
  const [now, setNow] = useState<Date>(() => new Date())
  const [weather, setWeather] = useState<WeatherResponse | null>(null)
  const [loadingWx, setLoadingWx] = useState(false)
  const [wxError, setWxError] = useState<string | null>(null)

  // 1-second ticker for the digital clock.
  useEffect(() => {
    const tick = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(tick)
  }, [])

  // One-shot weather fetch whenever coords change (i.e. user updated city).
  useEffect(() => {
    if (!coords) return
    const controller = new AbortController()
    setLoadingWx(true)
    setWxError(null)
    fetchWeather(coords.lat, coords.lng, controller.signal)
      .then(setWeather)
      .catch((err: Error) => {
        if (err.name !== "AbortError") setWxError(err.message)
      })
      .finally(() => setLoadingWx(false))
    return () => controller.abort()
  }, [coords])

  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        timeZone: "America/Sao_Paulo",
      }),
    [],
  )
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("pt-BR", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
        timeZone: "America/Sao_Paulo",
      }),
    [],
  )

  const dateStr = capitalize(dateFormatter.format(now))
  const timeStr = timeFormatter.format(now)

  return (
    <section className="overflow-hidden rounded-3xl border border-border bg-gradient-to-r from-canvas via-canvas to-subtle/40">
      <div className="grid gap-0 md:grid-cols-[minmax(220px,1fr)_1px_minmax(0,1.8fr)]">
        <ClockPanel timeStr={timeStr} dateStr={dateStr} location={location(cityName, uf)} />
        <div className="hidden bg-border md:block" aria-hidden />
        <WeatherPanel
          loading={loadingWx}
          error={wxError}
          data={weather}
          hasCoords={!!coords}
        />
      </div>
    </section>
  )
}

function ClockPanel({
  timeStr,
  dateStr,
  location,
}: {
  timeStr: string
  dateStr: string
  location: string | null
}) {
  // Split HH:MM from :SS so the seconds tick without the rest appearing to
  // repaint. Nicer on the eye than rewriting the whole number each second.
  const [hhmm, ss] = splitClock(timeStr)

  return (
    <div className="flex flex-col justify-center gap-2 p-6">
      <p className="text-[10px] uppercase tracking-[0.22em] text-muted">
        Agora · Brasília
      </p>
      <p className="flex items-baseline gap-1 font-mono text-4xl font-semibold tabular-nums tracking-tight text-strong md:text-5xl">
        <span>{hhmm}</span>
        <span className="text-2xl text-muted md:text-3xl">:{ss}</span>
      </p>
      <p className="text-sm text-body">{dateStr}</p>
      {location && (
        <p className="mt-1 flex items-center gap-1 text-xs text-muted">
          <MapPin className="h-3 w-3" />
          {location}
        </p>
      )}
    </div>
  )
}

function WeatherPanel({
  loading,
  error,
  data,
  hasCoords,
}: {
  loading: boolean
  error: string | null
  data: WeatherResponse | null
  hasCoords: boolean
}) {
  if (!hasCoords) {
    return (
      <div className="flex flex-col justify-center gap-2 p-6 text-xs text-muted">
        <p className="text-[10px] uppercase tracking-[0.22em]">Previsão do tempo</p>
        <p>
          Informe sua cidade no{" "}
          <a href="/app/profile" className="text-strong underline underline-offset-2">
            Perfil
          </a>{" "}
          para ver a previsão local.
        </p>
      </div>
    )
  }

  if (loading || !data) {
    return (
      <div className="flex items-center p-6 text-xs text-muted">
        <p className="text-[10px] uppercase tracking-[0.22em]">
          {error ? `Erro: ${error}` : "Carregando previsão..."}
        </p>
      </div>
    )
  }

  const today = data.daily[0]
  const tomorrow = data.daily[1]
  const dayAfter = data.daily[2]
  const NowIcon = iconForCondition(data.nowCondition)

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-muted">
            Clima agora
          </p>
          <p className="flex items-baseline gap-2 font-mono text-4xl font-semibold tabular-nums tracking-tight text-strong md:text-5xl">
            {data.nowC != null ? data.nowC : "—"}
            <span className="text-xl text-muted md:text-2xl">°C</span>
          </p>
          <p className="mt-1 text-sm text-body">
            {conditionLabelPtBr(data.nowCondition)}
          </p>
        </div>
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-subtle text-strong">
          <NowIcon className="h-7 w-7" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <DayCard label="Hoje" day={today} />
        <DayCard label="Amanhã" day={tomorrow} />
        <DayCard label={dayAfterLabel(dayAfter)} day={dayAfter} />
      </div>
    </div>
  )
}

function DayCard({ label, day }: { label: string; day: DailyForecast | undefined }) {
  if (!day) {
    return (
      <div className="rounded-xl border border-border bg-canvas p-3 text-xs text-muted">
        {label}
      </div>
    )
  }
  const Icon = iconForCondition(day.condition)
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-canvas p-3">
      <p className="text-[10px] uppercase tracking-[0.18em] text-muted">{label}</p>
      <div className="flex items-center justify-between gap-2">
        <Icon className="h-5 w-5 text-strong" />
        <span className="font-mono text-xs text-muted">
          {day.precipitationMm > 0 ? `${day.precipitationMm}mm` : ""}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-xl font-semibold tabular-nums text-strong">
          {day.tempMaxC}°
        </span>
        <span className="font-mono text-xs tabular-nums text-muted">
          {day.tempMinC}°
        </span>
      </div>
      <p className="truncate text-[11px] text-body" title={conditionLabelPtBr(day.condition)}>
        {conditionLabelPtBr(day.condition)}
      </p>
    </div>
  )
}

function iconForCondition(c: WeatherCondition) {
  switch (c) {
    case "clear":
      return Sun
    case "partly-cloudy":
      return Cloud
    case "cloudy":
      return Cloud
    case "fog":
      return CloudFog
    case "drizzle":
      return CloudDrizzle
    case "rain":
      return CloudRain
    case "thunderstorm":
      return Zap
    case "snow":
      return CloudSnow
    default:
      return Cloud
  }
}

function splitClock(s: string): [string, string] {
  const parts = s.split(":")
  if (parts.length < 3) return [s, ""]
  return [`${parts[0]}:${parts[1]}`, parts[2]!]
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function location(cityName: string | null, uf: string | null): string | null {
  if (cityName && uf) return `${cityName} · ${uf}`
  if (uf) return uf
  return null
}

function dayAfterLabel(day: DailyForecast | undefined): string {
  if (!day) return "Depois"
  try {
    const d = new Date(`${day.date}T00:00:00-03:00`)
    const w = d.toLocaleDateString("pt-BR", {
      weekday: "short",
      timeZone: "America/Sao_Paulo",
    })
    return capitalize(w.replace(".", ""))
  } catch {
    return "Depois"
  }
}
