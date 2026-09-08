import { BunRuntime, BunServices } from "@effect/platform-bun"
import { checkStorageRoots } from "@ha/documents/storage-config"
import { Effect } from "effect"

// Read-only readiness; durable jobs and rendering belong to the next slice.
const main = Effect.gen(function* () {
  const status = yield* checkStorageRoots()
  yield* Effect.logInfo("Storage readiness verified", status)
})

BunRuntime.runMain(main.pipe(Effect.provide(BunServices.layer)))
