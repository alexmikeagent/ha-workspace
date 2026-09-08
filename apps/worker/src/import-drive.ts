import { BunRuntime, BunServices } from "@effect/platform-bun"
import { HttpClient } from "@confect/js"
import { api } from "@ha/backend/api"
import { LocalAuth, LocalAuthLive } from "@ha/backend/local-auth"
import { DriveStore, DriveStoreLive } from "@ha/documents/drive-store"
import { Config, Effect, Layer } from "effect"

const clientLayer = Layer.unwrap(
  Config.string("CONVEX_SELF_HOSTED_URL").pipe(Effect.map((url) => HttpClient.layer(url))),
)
const main = Effect.gen(function* () {
  const store = yield* DriveStore
  const auth = yield* LocalAuth
  const client = yield* HttpClient.HttpClient
  yield* client.setAuth(
    yield* auth.issue({
      sub: "service:drive-importer",
      sessionId: "drive-importer",
      role: "importer",
      workspaceId: "ha-workspace",
    }),
  )
  yield* Effect.logInfo("Scanning the standalone working copy")
  const snapshot = yield* store.scan()
  const base = { companies: [], projects: [], files: [], importedAt: snapshot.importedAt }
  for (let offset = 0; offset < snapshot.companies.length; offset += 50) {
    yield* client.mutation(api.workspace.upsertBatch, {
      ...base,
      companies: snapshot.companies.slice(offset, offset + 50),
    })
  }
  for (let offset = 0; offset < snapshot.projects.length; offset += 50) {
    yield* client.mutation(api.workspace.upsertBatch, {
      ...base,
      projects: snapshot.projects.slice(offset, offset + 50),
    })
  }
  for (let offset = 0; offset < snapshot.files.length; offset += 50) {
    yield* client.mutation(api.workspace.upsertBatch, {
      ...base,
      files: snapshot.files.slice(offset, offset + 50).map(({ file }) => file),
    })
  }
  yield* Effect.logInfo("Import complete", {
    companies: snapshot.companies.length,
    projects: snapshot.projects.length,
    files: snapshot.files.length,
  })
})

BunRuntime.runMain(
  main.pipe(
    Effect.provide(Layer.mergeAll(clientLayer, LocalAuthLive, DriveStoreLive)),
    Effect.provide(BunServices.layer),
  ),
)
