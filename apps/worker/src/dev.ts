import { fileURLToPath } from "node:url"
import { BunRuntime, BunServices } from "@effect/platform-bun"
import { Effect, Schema } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"

class DevelopmentStopped extends Schema.TaggedError<DevelopmentStopped>()("DevelopmentStopped", {
  message: Schema.String,
}) {}

const main = Effect.gen(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const cwd = fileURLToPath(new URL("../../../", import.meta.url))
  const options = {
    cwd,
    stdin: "ignore" as const,
    stdout: "inherit" as const,
    stderr: "inherit" as const,
    forceKillAfter: "3 seconds" as const,
  }
  const api = yield* spawner.spawn(
    ChildProcess.make(process.execPath, ["--watch", "apps/web/server.ts", "--api-only"], options),
  )
  const web = yield* spawner.spawn(ChildProcess.make("vp", ["-C", "apps/web", "dev"], options))
  // Both handles belong to this scope. If either exits or this runner is
  // interrupted, the process adapter terminates the other owned process tree.
  const stopped = yield* Effect.raceFirst(
    api.exitCode.pipe(Effect.map((code) => ({ name: "API", code }))),
    web.exitCode.pipe(Effect.map((code) => ({ name: "web", code }))),
  )
  return yield* new DevelopmentStopped({
    message: `The ${stopped.name} process stopped (exit ${stopped.code}); both development processes were closed.`,
  })
})

BunRuntime.runMain(main.pipe(Effect.scoped, Effect.provide(BunServices.layer)))
