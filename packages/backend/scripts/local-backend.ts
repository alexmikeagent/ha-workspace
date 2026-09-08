import { spawn } from "node:child_process"
import { mkdir } from "node:fs/promises"
import { resolve } from "node:path"
import { Config, Effect, Schema } from "effect"

class BackendStartError extends Schema.TaggedError<BackendStartError>()("BackendStartError", {
  message: Schema.String,
}) {}
const main = Effect.gen(function* () {
  const dataRoot = yield* Config.string("WORKSPACE_DATA_ROOT")
  const instance = yield* Config.string("CONVEX_INSTANCE_NAME")
  const secret = yield* Config.string("CONVEX_INSTANCE_SECRET")
  const url = yield* Config.string("CONVEX_SELF_HOSTED_URL")
  const site = yield* Config.string("CONVEX_SITE_URL")
  if (
    url !== "http://127.0.0.1:3220" ||
    site !== "http://127.0.0.1:3221" ||
    instance !== "ha-workspace-local"
  )
    return yield* Effect.fail(
      new BackendStartError({ message: "Refusing to start outside the dedicated HA deployment." }),
    )
  const root = resolve(dataRoot, "convex")
  yield* Effect.tryPromise({
    try: () => mkdir(root, { recursive: true, mode: 0o700 }),
    catch: () => new BackendStartError({ message: "Unable to prepare backend storage." }),
  })
  const args = [
    "--interface",
    "127.0.0.1",
    "--port",
    "3220",
    "--site-proxy-port",
    "3221",
    "--instance-name",
    instance,
    "--instance-secret",
    secret,
    "--local-storage",
    resolve(root, "storage"),
    "--disable-beacon",
    "--redact-logs-to-client",
    resolve(root, "database.sqlite3"),
  ]
  const child = yield* Effect.acquireRelease(
    Effect.sync(() =>
      spawn(resolve(root, "bin/convex-local-backend"), args, {
        stdio: ["ignore", "inherit", "inherit"],
        env: { PATH: process.env.PATH },
      }),
    ),
    (child) =>
      Effect.sync(() => {
        child.kill("SIGINT")
      }),
  )
  yield* Effect.tryPromise({
    try: () =>
      new Promise<void>((resolve, reject) => {
        child.on("error", reject)
        child.on("exit", (code) =>
          code === 0 ? resolve() : reject(new Error("Backend process stopped.")),
        )
      }),
    catch: () =>
      new BackendStartError({ message: "Dedicated backend stopped. Check its local log." }),
  })
}).pipe(Effect.scoped)
const controller = new AbortController()
process.on("SIGINT", () => controller.abort())
process.on("SIGTERM", () => controller.abort())
await Effect.runPromise(main, { signal: controller.signal })
