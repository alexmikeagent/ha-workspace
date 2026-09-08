import { BunRuntime, BunServices } from "@effect/platform-bun"
import { Config, Effect, FileSystem, Schema } from "effect"

class ServerStartupFailed extends Schema.TaggedError<ServerStartupFailed>()("ServerStartupFailed", {
  message: Schema.String,
}) {}

type StartEntry = { default: { fetch: (request: Request) => Response | Promise<Response> } }

const main = Effect.gen(function* () {
  const config = yield* Config.all({
    host: Config.literals(["127.0.0.1", "localhost"], "HOST"),
    port: Config.port("PORT"),
  })
  const fs = yield* FileSystem.FileSystem
  const clientRoot = new URL("./dist/client/", import.meta.url)
  const serverEntry = new URL("./dist/server/server.js", import.meta.url).href
  const entry = yield* Effect.tryPromise({
    try: () => import(serverEntry) as Promise<StartEntry>,
    catch: () =>
      new ServerStartupFailed({ message: "Build the web app before starting its server." }),
  })
  const files = yield* fs.readDirectory(clientRoot.pathname, { recursive: true })
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
          fetch(request) {
            const pathname = new URL(request.url).pathname
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
  yield* Effect.logInfo(`Workspace listening on ${server.url}`)
  yield* Effect.never
})

BunRuntime.runMain(main.pipe(Effect.scoped, Effect.provide(BunServices.layer)))
