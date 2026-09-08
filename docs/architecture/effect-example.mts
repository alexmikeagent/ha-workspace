import { Context, Effect, Layer, ManagedRuntime, Schema } from "effect"

const Revise = Schema.Struct({
  fileId: Schema.String,
  baseRevisionId: Schema.String,
  requestId: Schema.String,
})

class RevisionConflict extends Schema.TaggedError<RevisionConflict>()("RevisionConflict", {
  currentRevisionId: Schema.String,
}) {}

class RevisionRequests extends Context.Service<
  RevisionRequests,
  {
    readonly enqueue: (
      input: typeof Revise.Type,
    ) => Effect.Effect<{ readonly jobId: string }, RevisionConflict>
  }
>()("ha/documents/RevisionRequests") {}

export const requestRevision = Effect.fn("documents.requestRevision")(function* (input: unknown) {
  const command = yield* Schema.decodeUnknownEffect(Revise)(input)
  const requests = yield* RevisionRequests
  return yield* requests.enqueue(command)
})

const runtime = ManagedRuntime.make(
  Layer.succeed(RevisionRequests, {
    enqueue: Effect.fn("RevisionRequests.enqueue")(function* (command) {
      if (command.baseRevisionId !== "r1") {
        return yield* new RevisionConflict({ currentRevisionId: "r1" })
      }
      return { jobId: "job:" + command.requestId }
    }),
  }),
)

const success = await runtime.runPromise(
  requestRevision({
    fileId: "f1",
    baseRevisionId: "r1",
    requestId: "test",
  }),
)
if (success.jobId !== "job:test") throw new Error("Success mismatch")

const failure = await runtime.runPromise(
  requestRevision({
    fileId: "f1",
    baseRevisionId: "stale",
    requestId: "test",
  }).pipe(Effect.flip),
)
if (failure._tag !== "RevisionConflict") throw new Error("Failure mismatch")
await runtime.dispose()
console.log(
  "RC.112 sample: typed service, schema decoding, named fn, typed error, runtime disposal passed",
)
