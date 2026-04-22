// Thin Open-Meteo client (no API key, CORS-enabled, gov-grade reliability).
// Docs: https://open-meteo.com/en/docs
//
// We request the current temperature + 3-day daily forecast and normalize
// the WMO weather codes into a small enum the UI can map to lucide icons.

export type WeatherCondition =
  | "clear"
  | "partly-cloudy"
  | "cloudy"
  | "fog"
  | "drizzle"
  | "rain"
  | "thunderstorm"
  | "snow"
  | "unknown"

export interface DailyForecast {
  date: string // yyyy-MM-dd (already in America/Sao_Paulo)
  tempMinC: number
  tempMaxC: number
  condition: WeatherCondition
  precipitationMm: number
}

export interface WeatherResponse {
  nowC: number | null
  nowCondition: WeatherCondition
  daily: DailyForecast[]
}

const BASE = "https://api.open-meteo.com/v1/forecast"

export async function fetchWeather(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<WeatherResponse> {
  const url = new URL(BASE)
  url.searchParams.set("latitude", lat.toFixed(4))
  url.searchParams.set("longitude", lng.toFixed(4))
  url.searchParams.set("current", "temperature_2m,weather_code")
  url.searchParams.set(
    "daily",
    "temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum",
  )
  url.searchParams.set("timezone", "America/Sao_Paulo")
  url.searchParams.set("forecast_days", "3")

  const res = await fetch(url.toString(), { signal })
  if (!res.ok) throw new Error(`weather ${res.status}`)
  const json = (await res.json()) as {
    current?: { temperature_2m?: number; weather_code?: number }
    daily?: {
      time?: string[]
      temperature_2m_max?: number[]
      temperature_2m_min?: number[]
      weather_code?: number[]
      precipitation_sum?: number[]
    }
  }

  const daily: DailyForecast[] = []
  const d = json.daily
  if (d?.time && d.temperature_2m_max && d.temperature_2m_min && d.weather_code) {
    for (let i = 0; i < d.time.length; i++) {
      daily.push({
        date: d.time[i]!,
        tempMinC: Math.round(d.temperature_2m_min[i] ?? 0),
        tempMaxC: Math.round(d.temperature_2m_max[i] ?? 0),
        condition: codeToCondition(d.weather_code[i] ?? -1),
        precipitationMm: Math.round((d.precipitation_sum?.[i] ?? 0) * 10) / 10,
      })
    }
  }

  return {
    nowC:
      typeof json.current?.temperature_2m === "number"
        ? Math.round(json.current.temperature_2m)
        : null,
    nowCondition: codeToCondition(json.current?.weather_code ?? -1),
    daily,
  }
}

// WMO 4677 codes reduced to our small UI enum.
export function codeToCondition(code: number): WeatherCondition {
  if (code === 0) return "clear"
  if (code >= 1 && code <= 2) return "partly-cloudy"
  if (code === 3) return "cloudy"
  if (code >= 45 && code <= 48) return "fog"
  if (code >= 51 && code <= 57) return "drizzle"
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rain"
  if (code >= 95 && code <= 99) return "thunderstorm"
  if (code >= 71 && code <= 77 || code === 85 || code === 86) return "snow"
  return "unknown"
}

export function conditionLabelPtBr(c: WeatherCondition): string {
  switch (c) {
    case "clear":
      return "Sol"
    case "partly-cloudy":
      return "Parcialmente nublado"
    case "cloudy":
      return "Nublado"
    case "fog":
      return "Névoa"
    case "drizzle":
      return "Garoa"
    case "rain":
      return "Chuva"
    case "thunderstorm":
      return "Tempestade"
    case "snow":
      return "Neve"
    default:
      return "—"
  }
}
