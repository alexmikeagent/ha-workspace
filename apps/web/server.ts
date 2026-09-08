import { BunRuntime, BunServices } from "@effect/platform-bun"
import { LocalAuthLive } from "@ha/backend/local-auth"
import { DriveStoreLive } from "@ha/documents/drive-store"
import { PreviewStoreLive } from "@ha/documents/preview"
import { Config, Effect, FileSystem, Layer, Schema } from "effect"
import { LocalApi, LocalApiLive, LocalApiSettingsLive, LocalFileResponseLive } from "./server/api"
import { jsonResponse } from "./server/security"

class ServerStartupFailed extends Schema.TaggedError<ServerStartupFailed>()("ServerStartupFailed", {
  message: Schema.String,
}) {}

type StartEntry = { default: { fetch: (request: Request) => Response | Promise<Response> } }

const main = Effect.gen(function* () {
  const apiOnly = process.argv.includes("--api-only")
  const config = yield* Config.all({
    host: Config.literals(["127.0.0.1", "localhost"], "HOST"),
    port: Config.port(apiOnly ? "API_PORT" : "PORT"),
  })
  const api = yield* LocalApi
  const context = yield* Effect.context<LocalApi>()
  const runRequest = Effect.runPromiseWith(context)
  const fs = yield* FileSystem.FileSystem
  const clientRoot = new URL("./dist/client/", import.meta.url)
  const serverEntry = new URL("./dist/server/server.js", import.meta.url).href
  const entry = apiOnly
    ? null
    : yield* Effect.tryPromise({
        try: () => import(serverEntry) as Promise<StartEntry>,
        catch: () =>
          new ServerStartupFailed({ message: "Build the web app before starting its server." }),
      })
  const files = apiOnly ? [] : yield* fs.readDirectory(clientRoot.pathname, { recursive: true })
  const assets = new Map<string, Bun.BunFile>()
  yield* Effect.forEach(
    files,
    (name) =>
      Effect.gen(function* () {
        const file = new URL(name, clientRoot)
        const info = yield* fs.stat(file.pathname)
        if (info.type === "File") assets.set(`/${name}`, Bun.file(file))
      }),
    { concurrency: 8 },
  )
  const server = yield* Effect.acquireRelease(
    Effect.try({
      try: () =>
        Bun.serve({
          hostname: config.host,
          port: config.port,
          fetch(request, listener) {
            const pathname = new URL(request.url).pathname
            if (pathname === "/api" || pathname.startsWith("/api/")) {
              return runRequest(api.handle(request, listener.requestIP(request)?.address), {
                signal: request.signal,
              })
            }
            if (!entry) return jsonResponse({ error: "This listener serves the local API." }, 404)
            const asset = assets.get(pathname)
            if (asset && (request.method === "GET" || request.method === "HEAD")) {
              return new Response(request.method === "HEAD" ? null : asset, {
                headers: {
                  "Content-Type": asset.type,
                  "Cache-Control": pathname.startsWith("/assets/")
                    ? "public, max-age=31536000, immutable"
                    : "no-cache",
                },
              })
            }
            return entry.default.fetch(request)
          },
          error: () =>
            jsonResponse({ error: "The workspace could not complete this request." }, 500),
        }),
      catch: () =>
        new ServerStartupFailed({ message: "Unable to listen on the configured local address." }),
    }),
    (owned) =>
      Effect.tryPromise({
        try: () => owned.stop(true),
        catch: () => new ServerStartupFailed({ message: "Server shutdown failed." }),
      }).pipe(Effect.catch((error) => Effect.logWarning(error.message))),
  )
  yield* Effect.logInfo(`${apiOnly ? "Workspace API" : "Workspace"} listening on ${server.url}`)
  yield* Effect.never
})

const DocumentsLive = PreviewStoreLive.pipe(Layer.provideMerge(DriveStoreLive))
const ApiLive = LocalApiLive.pipe(
  Layer.provide(
    Layer.mergeAll(LocalAuthLive, DocumentsLive, LocalApiSettingsLive, LocalFileResponseLive),
  ),
)

BunRuntime.runMain(
  main.pipe(Effect.scoped, Effect.provide(ApiLive), Effect.provide(BunServices.layer)),
)
