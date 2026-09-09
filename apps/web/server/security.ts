import { Effect, Schema } from "effect"

export class HttpError extends Schema.TaggedError<HttpError>()("HttpError", {
  status: Schema.Number,
  message: Schema.String,
}) {}

export type LocalPolicy = {
  readonly authorities: ReadonlySet<string>
  readonly tailscale?: {
    readonly origin: string
    readonly ownerLogin: string
    readonly convexUrl: string
  }
}

const loopbackAddresses = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"])

// Serve strips client-supplied identity headers and inserts the authenticated
// tailnet login. Trust these only on loopback and for the configured HTTPS host.
export const validateLocalRequest = Effect.fn("http.validateLocalRequest")(function* (
  request: Request,
  remoteAddress: string | undefined,
  policy: LocalPolicy,
) {
  const denied = () =>
    new HttpError({
      status: 403,
      message: "Use the local workspace or its authorized Tailscale connection.",
    })
  const url = yield* Effect.try({ try: () => new URL(request.url), catch: denied })
  const host = request.headers.get("host")
  if (
    !remoteAddress ||
    !loopbackAddresses.has(remoteAddress) ||
    url.protocol !== "http:" ||
    !host ||
    host !== url.host
  ) {
    return yield* denied()
  }
  const tailscale = policy.tailscale
  const isTailscale = tailscale && host === new URL(tailscale.origin).host
  if (isTailscale) {
    if (request.headers.get("tailscale-user-login") !== tailscale.ownerLogin) return yield* denied()
  } else if (!policy.authorities.has(host) || request.headers.has("tailscale-user-login")) {
    return yield* denied()
  }
  const origin = request.headers.get("origin")
  if (origin && origin !== (isTailscale ? tailscale.origin : `http://${host}`))
    return yield* denied()
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
