import { createHash, randomUUID } from "node:crypto"
import { constants } from "node:fs"
import { copyFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { HttpClient } from "@confect/js"
import { api } from "@ha/backend/api"
import { LocalAuth, LocalAuthLive } from "@ha/backend/local-auth"
import { ClaimedRevision, ImportFile, WorkspaceError } from "@ha/domain/workspace"
import {
  DriveError,
  DriveStore,
  DriveStoreLive,
  hashFile,
  resolveDrivePath,
} from "@ha/documents/drive-store"
import { PreviewStore, PreviewStoreLive } from "@ha/documents/preview"
import { childEnvironment } from "@ha/documents/process-environment"
import {
  Clock,
  Config,
  Context,
  Effect,
  FileSystem,
  Layer,
  Path,
  Schedule,
  Schema,
  Stream,
} from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"

const fingerprint = (value: string) => createHash("sha256").update(value).digest("hex")
export class QueueUnavailable extends Schema.TaggedError<QueueUnavailable>()(
  "QueueUnavailable",
  {},
) {}
type QueueError = WorkspaceError | QueueUnavailable
export class RevisionQueue extends Context.Service<
  RevisionQueue,
  {
    readonly claim: (workerId: string) => Effect.Effect<ClaimedRevision | null, QueueError>
    readonly active: (job: ClaimedRevision) => Effect.Effect<boolean, QueueError>
    readonly complete: (job: ClaimedRevision, file: ImportFile) => Effect.Effect<void, QueueError>
    readonly fail: (job: ClaimedRevision, message: string) => Effect.Effect<void, QueueError>
  }
>()("ha/worker/RevisionQueue") {}
const queueError = (error: unknown): QueueError =>
  error instanceof WorkspaceError ? error : new QueueUnavailable()
export const RevisionQueueLive = Layer.effect(
  RevisionQueue,
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    const auth = yield* LocalAuth
    return RevisionQueue.of({
      claim: (workerId) =>
        auth
          .issue({
            sub: "service:drive-importer",
            sessionId: workerId,
            role: "importer",
            workspaceId: "ha-workspace",
          })
          .pipe(
            Effect.flatMap(client.setAuth),
            Effect.andThen(client.mutation(api.workspace.claimRevision, { workerId })),
            Effect.timeout("15 seconds"),
            Effect.mapError(queueError),
          ),
      active: (job) =>
        client.query(api.workspace.revisionActive, { jobId: job.id, fence: job.fence }).pipe(
          Effect.map((result) => result.active),
          Effect.timeout("15 seconds"),
          Effect.mapError(queueError),
        ),
      complete: (job, file) =>
        client
          .mutation(api.workspace.completeRevision, { jobId: job.id, fence: job.fence, file })
          .pipe(Effect.asVoid, Effect.timeout("15 seconds"), Effect.mapError(queueError)),
      fail: (job, message) =>
        client
          .mutation(api.workspace.failRevision, { jobId: job.id, fence: job.fence, message })
          .pipe(Effect.asVoid, Effect.timeout("15 seconds"), Effect.mapError(queueError)),
    })
  }),
)
const TransformResult = Schema.Struct({
  created: Schema.Boolean,
  message: Schema.optionalKey(Schema.String),
})
const leaseLost = () =>
  new DriveError({
    code: "Cancelled",
    message: "This revision was cancelled or its attempt expired.",
  })

// Each parent component is checked before descending, so existing symlinks cannot redirect writes.
const managedDirectory = Effect.fn("revision.prepareDirectory")(function* (
  root: string,
  relative: string,
) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  let prefix = ""
  for (const part of relative.split("/")) {
    prefix = prefix ? `${prefix}/${part}` : part
    const directory = path.join(root, prefix)
    if (!(yield* fs.exists(directory))) yield* fs.makeDirectory(directory, { mode: 0o700 })
    yield* resolveDrivePath(root, prefix)
  }
  return path.join(root, relative)
})
export const prepareRevision = Effect.fn("revision.prepare")(function* (job: ClaimedRevision) {
  const store = yield* DriveStore
  const preview = yield* PreviewStore
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const python = yield* Config.string("PYTHON_BIN")
  const helper = fileURLToPath(
    new URL("../../../packages/documents/scripts/revise_document.py", import.meta.url),
  )
  const base = yield* store.resolve(job.fileId, job.baseVersionId)
  if (yield* fs.exists(path.join(path.dirname(base.path), `~$${path.basename(base.path)}`)))
    return yield* new DriveError({
      code: "DocumentLocked",
      message: "Close the source document before requesting a revision.",
    })
  const staging = yield* fs.makeTempDirectoryScoped({
    directory: store.dataRoot,
    prefix: "revision-",
  })
  const input = path.join(staging, `source.${base.record.file.extension}`)
  const candidate = path.join(staging, `candidate.${base.record.file.extension}`)
  yield* fs.copyFile(base.path, input)
  if ((yield* hashFile(input)) !== base.record.file.sha256)
    return yield* new DriveError({
      code: "SourceChanged",
      message: "The base file changed before the revision began.",
    })
  const request = new TextEncoder().encode(
    JSON.stringify({ find: job.find, replacement: job.replacement }),
  )
  const raw = yield* spawner
    .string(
      ChildProcess.make(python, [helper, input, candidate], {
        stdin: Stream.succeed(request),
        stderr: "ignore",
        forceKillAfter: "2 seconds",
        env: childEnvironment,
        extendEnv: false,
      }),
    )
    .pipe(Effect.timeout("30 seconds"))
  const transformed = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(TransformResult))(raw)
  if (!transformed.created)
    return yield* new DriveError({
      code: "RevisionFailed",
      message: transformed.message ?? "The selected text could not be revised.",
    })
  const sha256 = yield* hashFile(candidate)
  if (sha256 === base.record.file.sha256)
    return yield* new DriveError({
      code: "Unchanged",
      message: "The replacement did not change the document.",
    })
  const relativeDirectory = `.ha-workspace/revisions/${fingerprint(job.id)}/${job.fence}`
  const directory = yield* managedDirectory(store.driveRoot, relativeDirectory)
  const relativePath = `${relativeDirectory}/${sha256}.${base.record.file.extension}`
  const output = path.join(directory, `${sha256}.${base.record.file.extension}`)
  if (!(yield* fs.exists(output))) {
    yield* Effect.tryPromise({
      try: () => copyFile(candidate, output, constants.COPYFILE_EXCL),
      catch: () =>
        new DriveError({
          code: "RevisionWriteFailed",
          message: "The revision could not be saved without replacing an existing file.",
        }),
    })
  }
  yield* resolveDrivePath(store.driveRoot, relativePath)
  if ((yield* hashFile(output)) !== sha256)
    return yield* new DriveError({
      code: "VersionConflict",
      message: "An existing revision does not match the prepared bytes.",
    })
  const versionId = fingerprint(`version:${job.fileId}:${sha256}`)
  const now = yield* Clock.currentTimeMillis
  const file = {
    ...base.record.file,
    currentVersionId: versionId,
    sha256,
    size: Number((yield* fs.stat(output)).size),
    importedAt: now,
    modifiedAt: now,
  }
  yield* store.recordRevision({ file, relativePath })
  // The candidate and its read-only preview exist before the authoritative current version changes.
  if (file.extension === "docx") yield* preview.content(job.fileId, versionId)
  return file
})

export const runRevisionAttempt = Effect.fn("revision.attempt")(function* <E, R>(
  job: ClaimedRevision,
  work: Effect.Effect<ImportFile, E, R>,
) {
  const queue = yield* RevisionQueue
  const check = Effect.gen(function* () {
    if ((yield* Clock.currentTimeMillis) >= job.leaseExpiresAt) return yield* leaseLost()
    if (!(yield* queue.active(job))) return yield* leaseLost()
  })
  const cancelled = Effect.forever(
    Effect.sleep("1 second").pipe(
      Effect.andThen(check),
      // A brief backend outage is not evidence of cancellation. Completion remains fenced server-side.
      Effect.catchTag("QueueUnavailable", () => Effect.void),
    ),
  )
  yield* check.pipe(
    Effect.andThen(Effect.raceFirst(work.pipe(Effect.scoped), cancelled)),
    Effect.flatMap((file) =>
      queue.complete(job, file).pipe(
        Effect.retry({
          times: 3,
          schedule: Schedule.spaced("500 millis"),
          while: (error) => error instanceof QueueUnavailable,
        }),
      ),
    ),
    Effect.tap(() => Effect.logInfo("Revision ready for review", { jobId: job.id })),
    Effect.catch((error) => {
      if (
        (error instanceof DriveError && error.code === "Cancelled") ||
        (error instanceof WorkspaceError && error.code === "LeaseLost")
      )
        return Effect.logInfo("Revision attempt stopped", { jobId: job.id })
      if (error instanceof QueueUnavailable)
        return Effect.logWarning(
          "Revision acknowledgement unavailable; its durable lease will permit recovery.",
          { jobId: job.id },
        )
      const message =
        error instanceof DriveError || error instanceof WorkspaceError
          ? error.message
          : "The revision could not be completed. The original is unchanged."
      return queue.fail(job, message).pipe(
        Effect.catch((failure) =>
          failure instanceof WorkspaceError && failure.code === "LeaseLost"
            ? Effect.logInfo("Revision attempt no longer owns the request", { jobId: job.id })
            : Effect.logWarning(
                "Revision failure acknowledgement unavailable; its durable lease will permit recovery.",
                { jobId: job.id },
              ),
        ),
        Effect.andThen(Effect.logWarning("Revision did not complete", { jobId: job.id })),
      )
    }),
  )
})
export const revisionMain = Effect.gen(function* () {
  const queue = yield* RevisionQueue
  const workerId = yield* Effect.sync(() => `worker-${randomUUID()}`)
  yield* Effect.logInfo("Revision worker ready")
  const cycle = Effect.gen(function* () {
    const job = yield* queue.claim(workerId)
    if (!job) return
    yield* Effect.logInfo("Preparing revision", { jobId: job.id, attempt: job.fence })
    yield* runRevisionAttempt(job, prepareRevision(job))
  })
  yield* Effect.forever(
    cycle.pipe(
      Effect.catch(() =>
        Effect.logWarning("Revision worker could not reach the backend; retrying shortly."),
      ),
      Effect.andThen(Effect.sleep("2 seconds")),
    ),
  )
})
if (import.meta.main) {
  const BunRuntime = await import("@effect/platform-bun/BunRuntime")
  const BunServices = await import("@effect/platform-bun/BunServices")
  const clientLayer = Layer.unwrap(
    Config.string("CONVEX_SELF_HOSTED_URL").pipe(Effect.map((url) => HttpClient.layer(url))),
  )
  const queue = RevisionQueueLive.pipe(Layer.provide(Layer.mergeAll(LocalAuthLive, clientLayer)))
  const services = Layer.mergeAll(queue, PreviewStoreLive.pipe(Layer.provideMerge(DriveStoreLive)))
  BunRuntime.runMain(revisionMain.pipe(Effect.provide(services), Effect.provide(BunServices.layer)))
}
