import type { City, RangeKey } from "./types"

// Pool de cidades brasileiras pra sorteio (com coords pro mapa do sysadmin)
export const CITIES: City[] = [
  { city: "São Paulo", uf: "SP", lat: -23.55, lng: -46.63 },
  { city: "Rio de Janeiro", uf: "RJ", lat: -22.91, lng: -43.17 },
  { city: "Belo Horizonte", uf: "MG", lat: -19.92, lng: -43.94 },
  { city: "Porto Alegre", uf: "RS", lat: -30.03, lng: -51.22 },
  { city: "Curitiba", uf: "PR", lat: -25.43, lng: -49.27 },
  { city: "Salvador", uf: "BA", lat: -12.97, lng: -38.51 },
  { city: "Recife", uf: "PE", lat: -8.05, lng: -34.88 },
  { city: "Florianópolis", uf: "SC", lat: -27.59, lng: -48.55 },
  { city: "Brasília", uf: "DF", lat: -15.78, lng: -47.93 },
  { city: "Fortaleza", uf: "CE", lat: -3.73, lng: -38.52 },
  { city: "Goiânia", uf: "GO", lat: -16.68, lng: -49.25 },
  { city: "Belém", uf: "PA", lat: -1.46, lng: -48.5 },
]

// RNG seeded (mulberry32). Seed passado no setup pra dar variedade
// entre re-seeds sem depender do Math.random global.
export function makeRng(seed: number) {
  let s = seed
  return () => {
    s |= 0
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function pad2(n: number) {
  return String(n).padStart(2, "0")
}
export function isoDate(y: number, m: number, d: number) {
  return `${y}-${pad2(m)}-${pad2(d)}`
}
export function isoTs(y: number, m: number, d: number, hour = 12) {
  return `${y}-${pad2(m)}-${pad2(d)}T${pad2(hour)}:00:00Z`
}
export function daysInMonth(y: number, m: number) {
  return new Date(y, m, 0).getDate()
}

export function monthsForRange(range: RangeKey): string[] {
  const months: string[] = []
  const push = (y: number, m: number) =>
    months.push(`${y}-${pad2(m)}`)
  switch (range) {
    case "2025":
      for (let m = 1; m <= 12; m++) push(2025, m)
      return months
    case "2026":
      for (let m = 1; m <= 12; m++) push(2026, m)
      return months
    case "q1-2026":
      for (let m = 1; m <= 3; m++) push(2026, m)
      return months
    case "last-12m": {
      const now = new Date()
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        push(d.getFullYear(), d.getMonth() + 1)
      }
      return months
    }
    case "full":
    default:
      for (let m = 1; m <= 12; m++) push(2025, m)
      for (let m = 1; m <= 12; m++) push(2026, m)
      return months
  }
}
