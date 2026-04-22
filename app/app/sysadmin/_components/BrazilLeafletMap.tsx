"use client"

import { useEffect, useMemo, useState } from "react"
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  useMap,
} from "react-leaflet"
import type { LatLngBoundsExpression, LatLngTuple } from "leaflet"
import "leaflet/dist/leaflet.css"

export interface LeafletMarker {
  lat: number
  lng: number
  color: string
  name: string
  city: string
  daysSinceSignup: number
  gender: "M" | "F" | null
}

interface Props {
  markers: LeafletMarker[]
  dark?: boolean
}

function FitToMarkers({ markers }: { markers: LeafletMarker[] }) {
  const map = useMap()
  useEffect(() => {
    map.invalidateSize()
    const raf = requestAnimationFrame(() => map.invalidateSize())
    return () => cancelAnimationFrame(raf)
  }, [map])
  useEffect(() => {
    if (markers.length === 0) return
    if (markers.length === 1) {
      // Single pin → zoom in city-level so the user feels anchored.
      map.setView([markers[0]!.lat, markers[0]!.lng], 10)
      return
    }
    const bounds: LatLngBoundsExpression = markers.map(
      (m) => [m.lat, m.lng] as LatLngTuple,
    )
    // Tighter padding + higher maxZoom than the amazing-school defaults so
    // small clusters of pins zoom in close instead of floating in a wide
    // overview. Leaflet automatically picks the largest zoom level that
    // still fits every pin inside the padded viewport.
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 12 })
  }, [map, markers])
  return null
}

export default function BrazilLeafletMap({ markers, dark }: Props) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const isDark = mounted && dark

  const center = useMemo<LatLngTuple>(() => [-14.235, -51.9253], [])

  const tileUrl = isDark
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
  const bg = isDark ? "#0a0a0a" : "#f8f8f8"
  const popupMuted = isDark ? "#9ca3af" : "#6b7280"

  return (
    <MapContainer
      center={center}
      zoom={4}
      minZoom={3}
      maxZoom={12}
      scrollWheelZoom={false}
      touchZoom
      dragging
      style={{ width: "100%", background: bg }}
      className="h-[380px] sm:h-[460px] md:h-[520px]"
      attributionControl={false}
    >
      <TileLayer
        key={isDark ? "dark" : "light"}
        url={tileUrl}
        subdomains="abcd"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        detectRetina
        maxZoom={19}
      />
      <FitToMarkers markers={markers} />
      {markers.map((m, i) => (
        <CircleMarker
          key={`${m.name}-${i}`}
          center={[m.lat, m.lng]}
          radius={9}
          pathOptions={{
            color: isDark ? "#f5f5f5" : "#1f1f1f",
            weight: 1.5,
            fillColor: m.color,
            fillOpacity: 0.95,
          }}
        >
          <Popup closeButton={false} autoPan={false}>
            <div style={{ minWidth: 180, fontFamily: "system-ui, sans-serif" }}>
              <p style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>{m.name}</p>
              <p style={{ margin: "2px 0 6px", fontSize: 11, color: popupMuted }}>
                {m.city}
              </p>
              <p style={{ margin: 0, fontSize: 11, color: popupMuted }}>
                {m.daysSinceSignup} {m.daysSinceSignup === 1 ? "dia" : "dias"} na
                plataforma
              </p>
              {m.gender && (
                <p style={{ margin: 0, fontSize: 11, color: popupMuted }}>
                  {m.gender === "M" ? "Masculino" : "Feminino"}
                </p>
              )}
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  )
}
