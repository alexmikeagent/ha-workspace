import { LocalAuth, type LocalIdentity } from "@ha/backend/local-auth"
import { DriveError, DriveStore } from "@ha/documents/drive-store"
import { PreviewStore } from "@ha/documents/preview"
import { AgentLibraryError, AgentLibraryStore } from "@ha/documents/agent-library"
import { Config, Context, Effect, Layer, Option, Schema } from "effect"
import {
  HttpError,
  downloadDisposition,
  jsonResponse,
  privateHeaders,
  sessionCookie,
  sessionCookieName,
  sessionSeconds,
  validateLocalRequest,
  type LocalPolicy,
} from "./security"

export class LocalApiSettings extends Context.Service<
  LocalApiSettings,
  { readonly policy: LocalPolicy; readonly convexUrl: string }
>()("ha/http/LocalApiSettings") {}

export const LocalApiSettingsLive = Layer.effect(
  LocalApiSettings,
  Effect.gen(function* () {
    const port = yield* Config.port("PORT")
    const apiPort = yield* Config.port("API_PORT")
    const convexUrl = yield* Config.url("CONVEX_SELF_HOSTED_URL")
    const tailscaleJson = yield* Config.option(Config.string("TAILSCALE_ACCESS_JSON"))
    const tailscale = Option.isSome(tailscaleJson)
      ? yield* Schema.decodeUnknownEffect(
          Schema.fromJsonString(
            Schema.Struct({
              origin: Schema.String,
              ownerLogin: Schema.NonEmptyString,
              convexUrl: Schema.String,
            }),
          ),
        )(tailscaleJson.value).pipe(
          Effect.mapError(
            () => new HttpError({ status: 500, message: "Tailscale configuration is invalid." }),
          ),
        )
      : undefined
    if (tailscale) {
      const valid = yield* Effect.try({
        try: () => {
          const web = new URL(tailscale.origin)
          const backend = new URL(tailscale.convexUrl)
          return (
            [web, backend].every(
              (value) =>
                value.protocol === "https:" &&
                value.hostname.endsWith(".ts.net") &&
                !value.username &&
                !value.password &&
                !value.search &&
                !value.hash &&
                value.pathname === "/",
            ) &&
            web.hostname === backend.hostname &&
            web.origin !== backend.origin &&
            web.origin === tailscale.origin &&
            backend.origin === tailscale.convexUrl
          )
        },
        catch: () => new HttpError({ status: 500, message: "Tailscale addresses are invalid." }),
      })
      if (!valid)
        return yield* new HttpError({ status: 500, message: "Tailscale addresses are invalid." })
    }
    if (
      convexUrl.protocol !== "http:" ||
      !["127.0.0.1", "localhost"].includes(convexUrl.hostname) ||
      convexUrl.username ||
      convexUrl.password ||
      convexUrl.search ||
      convexUrl.hash ||
      convexUrl.pathname !== "/"
    ) {
      return yield* new HttpError({ status: 500, message: "The local backend address is invalid." })
    }
    return {
      policy: {
        ...(tailscale ? { tailscale } : {}),
        authorities: new Set(
          ["127.0.0.1", "localhost"].flatMap((host) => [`${host}:${port}`, `${host}:${apiPort}`]),
        ),
      },
      convexUrl: convexUrl.origin,
    }
  }),
)

export class LocalFileResponse extends Context.Service<
  LocalFileResponse,
  {
    readonly serve: (
      path: string,
      mime: string,
      downloadName?: string,
    ) => Effect.Effect<Response, HttpError>
  }
>()("ha/http/LocalFileResponse") {}

export const LocalFileResponseLive = Layer.succeed(LocalFileResponse, {
  serve: (path, mime, downloadName) =>
    Effect.try({
      try: () =>
        new Response(Bun.file(path), {
          headers: privateHeaders({
            "Content-Type": mime,
            ...(downloadName ? { "Content-Disposition": downloadDisposition(downloadName) } : {}),
          }),
        }),
      catch: () => new HttpError({ status: 503, message: "This file could not be opened." }),
    }),
})

export class LocalApi extends Context.Service<
  LocalApi,
  {
    readonly handle: (
      request: Request,
      remoteAddress: string | undefined,
    ) => Effect.Effect<Response>
  }
>()("ha/http/LocalApi") {}

function driveFailure(error: DriveError): HttpError {
  const statuses: Record<string, number> = {
    NotFound: 404,
    InvalidPath: 400,
    SourceChanged: 409,
    Unsupported: 415,
    TooLarge: 413,
    InvalidDocument: 422,
    PreviewFailed: 422,
    Unavailable: 503,
    ImportFailed: 503,
  }
  return new HttpError({ status: statuses[error.code] ?? 500, message: error.message })
}

function agentLibraryFailure(error: AgentLibraryError): HttpError {
  const statuses = {
    NotFound: 404,
    InvalidResource: 415,
    Changed: 409,
    TooLarge: 413,
    Unavailable: 503,
  } as const
  return new HttpError({ status: statuses[error.code], message: error.message })
}

const fileRoute =
  /^\/api\/files\/([a-f0-9]{64})\/versions\/([a-f0-9]{64})\/(preview|content|context|download)$/

export const LocalApiLive = Layer.effect(
  LocalApi,
  Effect.gen(function* () {
    const auth = yield* LocalAuth
    const drive = yield* DriveStore
    const previews = yield* PreviewStore
    const agents = yield* AgentLibraryStore
    const files = yield* LocalFileResponse
    const settings = yield* LocalApiSettings
    const owner = Effect.fn("http.owner")(function* (token: string | undefined) {
      if (!token)
        return yield* new HttpError({ status: 401, message: "Open the workspace to sign in." })
      const identity = yield* auth
        .verify(token)
        .pipe(
          Effect.mapError(
            () => new HttpError({ status: 401, message: "Your local session ended." }),
          ),
        )
      if (identity.role !== "owner" || identity.sub !== "local:akh") {
        return yield* new HttpError({ status: 403, message: "This session cannot open files." })
      }
      return identity
    })

    const handle = Effect.fn("http.localApi")(function* (
      request: Request,
      remoteAddress: string | undefined,
    ) {
      const url = yield* validateLocalRequest(request, remoteAddress, settings.policy)
      if (request.method !== "GET") {
        return jsonResponse({ error: "Use GET for this endpoint." }, 405, { Allow: "GET" })
      }
      if (url.search)
        return yield* new HttpError({ status: 400, message: "Unexpected query parameters." })
      if (url.pathname === "/api/health") {
        return yield* drive.index().pipe(
          Effect.match({
            onFailure: () => jsonResponse({ status: "starting", catalog: "unavailable" }, 503),
            onSuccess: () => jsonResponse({ status: "ready", catalog: "ready" }),
          }),
        )
      }
      if (url.pathname === "/api/session") {
        const remoteSession =
          settings.policy.tailscale && url.host === new URL(settings.policy.tailscale.origin).host
        const previous = yield* owner(sessionCookie(request)).pipe(
          Effect.catch(() => Effect.succeed(null)),
        )
        const identity: LocalIdentity = previous ?? {
          sub: "local:akh",
          sessionId: yield* Effect.sync(() => crypto.randomUUID()),
          role: "owner",
          workspaceId: "ha-workspace",
        }
        const token = yield* auth
          .issue(identity)
          .pipe(
            Effect.mapError(
              () => new HttpError({ status: 503, message: "A local session could not be opened." }),
            ),
          )
        // Report a conservative deadline so browser refresh happens before JWT expiry.
        const expiresAt = yield* Effect.clockWith((clock) =>
          Effect.succeed(
            Math.floor(clock.currentTimeMillisUnsafe() / 1000) * 1000 + (sessionSeconds - 1) * 1000,
          ),
        )
        return jsonResponse(
          {
            sessionId: identity.sessionId,
            token,
            convexUrl: remoteSession ? settings.policy.tailscale!.convexUrl : settings.convexUrl,
            expiresAt,
            subject: identity.sub,
          },
          200,
          {
            "Set-Cookie": `${sessionCookieName}=${token}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${sessionSeconds}${remoteSession ? "; Secure" : ""}`,
          },
        )
      }
      yield* owner(sessionCookie(request))
      if (url.pathname === "/api/agents") return jsonResponse(yield* agents.list())
      const agentMatch = /^\/api\/agents\/([a-f0-9]{64})$/.exec(url.pathname)
      if (agentMatch?.[1]) return jsonResponse(yield* agents.get(agentMatch[1]))
      const match = fileRoute.exec(url.pathname)
      if (!match)
        return yield* new HttpError({ status: 404, message: "This endpoint was not found." })
      const [, fileId = "", versionId = "", operation] = match
      if (operation === "preview") return jsonResponse(yield* previews.preview(fileId, versionId))
      if (operation === "context") return jsonResponse(yield* previews.context(fileId, versionId))
      if (operation === "content") {
        const content = yield* previews.content(fileId, versionId)
        return yield* files.serve(content.path, content.mime)
      }
      const resolved = yield* drive.resolve(fileId, versionId)
      return yield* files.serve(
        resolved.path,
        "application/octet-stream",
        resolved.record.file.name,
      )
    })
    return LocalApi.of({
      handle: (request, remoteAddress) =>
        handle(request, remoteAddress).pipe(
          Effect.catch((error) => {
            const failure =
              error instanceof DriveError
                ? driveFailure(error)
                : error instanceof AgentLibraryError
                  ? agentLibraryFailure(error)
                  : error
            return Effect.succeed(jsonResponse({ error: failure.message }, failure.status))
          }),
          Effect.catchDefect(() =>
            Effect.succeed(
              jsonResponse({ error: "The workspace could not complete this request." }, 500),
            ),
          ),
        ),
    })
  }),
)
