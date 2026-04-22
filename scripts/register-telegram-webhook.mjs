#!/usr/bin/env node
// Registers the production webhook URL with Telegram's Bot API. Run once
// after deploying, and again any time TELEGRAM_WEBHOOK_SECRET rotates.
//
// Usage (local):
//   TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... \
//   BASE_URL=https://your-app.vercel.app \
//   node scripts/register-telegram-webhook.mjs
//
// BASE_URL defaults to NEXT_PUBLIC_SITE_URL from .env.local.

import { readFileSync } from "node:fs"

function readEnv() {
  try {
    const raw = readFileSync(".env.local", "utf8")
    return Object.fromEntries(
      raw
        .split("\n")
        .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
        .map((l) => {
          const i = l.indexOf("=")
          return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
        }),
    )
  } catch {
    return {}
  }
}

const env = { ...readEnv(), ...process.env }
const token = env.TELEGRAM_BOT_TOKEN
const secret = env.TELEGRAM_WEBHOOK_SECRET
const base = env.BASE_URL || env.NEXT_PUBLIC_SITE_URL

if (!token) {
  console.error("TELEGRAM_BOT_TOKEN missing")
  process.exit(2)
}
if (!secret) {
  console.error("TELEGRAM_WEBHOOK_SECRET missing")
  process.exit(2)
}
if (!base || base.startsWith("http://localhost")) {
  console.error(
    "BASE_URL must be a public HTTPS URL (Vercel preview or prod). Got:",
    base,
  )
  console.error(
    "For local dev, use ngrok (https) and pass BASE_URL=https://<ngrok>.ngrok-free.app",
  )
  process.exit(2)
}

const webhook = `${base.replace(/\/$/, "")}/api/telegram/webhook/${encodeURIComponent(
  secret,
)}`

console.log("Setting webhook to:", webhook)

const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    url: webhook,
    allowed_updates: ["message"],
    // Tight drop window: we only care about fresh messages, so old updates
    // are discarded on reconfigure.
    drop_pending_updates: true,
  }),
})
const body = await res.json()
console.log("Telegram response:", body)
if (!body.ok) process.exit(1)

const info = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`)
console.log("Webhook info:", await info.json())
