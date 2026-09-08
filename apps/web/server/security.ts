import { Effect, Schema } from "effect"

export class HttpError extends Schema.TaggedError<HttpError>()("HttpError", {
  status: Schema.Number,
  message: Schema.String,
}) {}

export type LocalPolicy = {
  readonly authorities: ReadonlySet<string>
}

const loopbackAddresses = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"])

// Ignore forwarding headers: only the loopback listener and explicit app/API
// authorities are trusted. A Vite proxy must preserve the browser's Host header.
export const validateLocalRequest = Effect.fn("http.validateLocalRequest")(function* (
  request: Request,
  remoteAddress: string | undefined,
  policy: LocalPolicy,
) {
  const denied = () => new HttpError({ status: 403, message: "Open this workspace locally." })
  const url = yield* Effect.try({ try: () => new URL(request.url), catch: denied })
  const host = request.headers.get("host")
  if (
    !remoteAddress ||
    !loopbackAddresses.has(remoteAddress) ||
    url.protocol !== "http:" ||
    !host ||
    !policy.authorities.has(host) ||
    !policy.authorities.has(url.host)
  ) {
    return yield* denied()
  }
  const origin = request.headers.get("origin")
  if (origin && origin !== `http://${host}`) return yield* denied()
  const site = request.headers.get("sec-fetch-site")
  if (site && site !== "same-origin" && site !== "none") return yield* denied()
  return url
})

export const sessionCookieName = "ha_workspace_session"
export const sessionSeconds = 8 * 60 * 60

export function sessionCookie(request: Request): string | undefined {
  const values = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${sessionCookieName}=`))
  if (values.length !== 1) return undefined
  const token = values[0]?.slice(sessionCookieName.length + 1)
  return token && token.length <= 8192 && /^[A-Za-z0-9_.-]+$/.test(token) ? token : undefined
}

export function privateHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra)
  headers.set("Cache-Control", "private, no-store")
  headers.set("X-Content-Type-Options", "nosniff")
  headers.set("Cross-Origin-Resource-Policy", "same-origin")
  headers.set("Referrer-Policy", "no-referrer")
  headers.set("X-Frame-Options", "SAMEORIGIN")
  headers.set("Content-Security-Policy", "frame-ancestors 'self'")
  return headers
}

export function jsonResponse(value: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(value, { status, headers: privateHeaders(headers) })
}

export function downloadDisposition(name: string): string {
  const fallback = name.replace(/[^\x20-\x7e]|["\\]/g, "_").slice(0, 180) || "document"
  const encoded = [...new TextEncoder().encode(name)]
    .map((byte) => {
      const character = String.fromCharCode(byte)
      return /^[A-Za-z0-9!#$&+.^_`|~-]$/.test(character)
        ? character
        : `%${byte.toString(16).toUpperCase().padStart(2, "0")}`
    })
    .join("")
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`
}
