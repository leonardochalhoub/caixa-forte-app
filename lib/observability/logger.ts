type LogLevel = "debug" | "info" | "warn" | "error"

type LogContext = Record<string, unknown>

interface LogRecord {
  level: LogLevel
  msg: string
  ts: string
  [key: string]: unknown
}

function emit(level: LogLevel, msg: string, ctx?: LogContext) {
  const record: LogRecord = {
    level,
    msg,
    ts: new Date().toISOString(),
    ...ctx,
  }
  const line = JSON.stringify(record)
  if (level === "error") console.error(line)
  else if (level === "warn") console.warn(line)
  else console.log(line)
}

export const logger = {
  debug: (msg: string, ctx?: LogContext) => emit("debug", msg, ctx),
  info: (msg: string, ctx?: LogContext) => emit("info", msg, ctx),
  warn: (msg: string, ctx?: LogContext) => emit("warn", msg, ctx),
  error: (msg: string, ctx?: LogContext) => emit("error", msg, ctx),
}

export function redact(input: string | null | undefined, keep = 0): string {
  if (!input) return ""
  if (keep === 0) return `len=${input.length}`
  return `${input.slice(0, keep)}…(len=${input.length})`
}
