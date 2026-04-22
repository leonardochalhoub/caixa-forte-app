"use client"

import { useEffect } from "react"
import { heartbeatAction } from "../actions"

const STORAGE_KEY = "cfx:last-heartbeat"
const INTERVAL_MS = 15 * 60 * 1000 // 15 minutes between beats
const MIN_GAP_MS = 5 * 60 * 1000 // skip if we pinged in the last 5 min

// Silent client heartbeat. Mounted once in the app layout; when the user is
// logged in and active, sends a lightweight ping that the server records as
// a login event (debounced so we don't spam the table). This is how we know
// someone is actually using the app, not just that they once signed in.
export function LoginHeartbeat() {
  useEffect(() => {
    let cancelled = false

    function shouldSend(): boolean {
      try {
        const last = Number(localStorage.getItem(STORAGE_KEY) ?? 0)
        return Date.now() - last >= MIN_GAP_MS
      } catch {
        return true
      }
    }

    async function send() {
      if (!shouldSend()) return
      try {
        await heartbeatAction()
        if (!cancelled) {
          localStorage.setItem(STORAGE_KEY, String(Date.now()))
        }
      } catch {
        /* ignore — next beat will retry */
      }
    }

    // First beat on mount.
    void send()

    // Recurring beat.
    const interval = window.setInterval(send, INTERVAL_MS)

    // Beat when the tab regains focus (catches users returning after idle).
    function onFocus() {
      void send()
    }
    window.addEventListener("focus", onFocus)

    return () => {
      cancelled = true
      window.clearInterval(interval)
      window.removeEventListener("focus", onFocus)
    }
  }, [])

  return null
}
