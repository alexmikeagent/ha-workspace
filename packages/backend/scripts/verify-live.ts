import { createHash } from "node:crypto"
import { HttpClient } from "@confect/js"
import { Config, Effect, Layer, Schema } from "effect"
import { api } from "../src/api"
import { LocalAuth, LocalAuthLive } from "../src/local-auth"

class VerificationError extends Schema.TaggedError<VerificationError>()("VerificationError", {
  message: Schema.String,
}) {}
const main = Effect.gen(function* () {
  const client = yield* HttpClient.HttpClient
  const auth = yield* LocalAuth
  const denied = yield* client.query(api.workspace.catalog, {}).pipe(Effect.flip)
  if (!("code" in denied) || denied.code !== "Unauthenticated")
    return yield* Effect.fail(
      new VerificationError({
        message: "Unauthenticated catalog access was not rejected as expected.",
      }),
    )
  const token = yield* auth.issue({
    sub: "local:akh",
    sessionId: "live-verification",
    role: "owner",
    workspaceId: "ha-workspace",
  })
  yield* client.setAuth(token)
  const catalog = yield* client.query(api.workspace.catalog, {})
  yield* Effect.log("Authenticated catalog read passed", {
    fileCount: catalog.fileCount,
    companies: catalog.companies.length,
    projects: catalog.projects.length,
    catalogDigest: createHash("sha256").update(JSON.stringify(catalog)).digest("hex"),
  })
})
const layers = Layer.mergeAll(
  LocalAuthLive,
  Layer.unwrap(Config.string("CONVEX_SELF_HOSTED_URL").pipe(Effect.map(HttpClient.layer))),
)
await Effect.runPromise(main.pipe(Effect.provide(layers)))
