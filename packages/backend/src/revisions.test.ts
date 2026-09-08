import { TestConfect } from "@confect/test"
import { Effect, Option } from "effect"
import { it } from "@effect/vitest"
import { expect } from "vite-plus/test"
import schema from "../confect/_generated/schema"
import convexSchema from "../confect/_generated/convexSchema"
import { Reader, Writer } from "../confect/support"
import { api } from "./api"
import type { ImportFile } from "./contracts"

const Test = TestConfect.TestConfect<typeof schema>()
const layer = TestConfect.layer(schema, convexSchema, import.meta.glob("../convex/**/*.ts"))
const owner = { subject: "local:akh", workspaceId: "ha-workspace", role: "owner" }
const importer = {
  subject: "service:drive-importer",
  workspaceId: "ha-workspace",
  role: "importer",
}
const file: ImportFile = {
  id: "fixture",
  name: "Example.txt",
  companyId: null,
  projectId: null,
  category: "reference",
  extension: "txt",
  size: 4,
  modifiedAt: 1,
  importedAt: 2,
  currentVersionId: "a".repeat(64),
  sha256: "b".repeat(64),
  sourceLabel: "Fixture",
}
const replacement = {
  ...file,
  size: 5,
  sha256: "c".repeat(64),
  currentVersionId: "d".repeat(64),
  modifiedAt: 3,
  importedAt: 4,
}
const setup = Effect.gen(function* () {
  const test = yield* Test
  const read = test.withIdentity(owner),
    worker = test.withIdentity(importer)
  yield* worker.mutation(api.workspace.upsertBatch, {
    companies: [],
    projects: [],
    files: [file],
    importedAt: 2,
  })
  return { test, read, worker }
})
const request = {
  fileId: file.id,
  baseVersionId: file.currentVersionId,
  find: "text",
  replacement: "other",
  requestId: "request-revision-1",
}
it.effect("requests and completes once, and does not undo revisions on a source reimport", () =>
  Effect.gen(function* () {
    const { read, worker } = yield* setup
    const first = yield* read.mutation(api.workspace.requestRevision, request)
    expect(yield* read.mutation(api.workspace.requestRevision, request)).toEqual(first)
    expect(
      yield* read
        .mutation(api.workspace.requestRevision, { ...request, find: "different" })
        .pipe(Effect.flip),
    ).toMatchObject({ code: "IdempotencyConflict" })
    const claimed = yield* worker.mutation(api.workspace.claimRevision, { workerId: "worker:one" })
    expect(claimed?.fence).toBe(1)
    expect(
      yield* worker.query(api.workspace.revisionActive, {
        jobId: first.jobId,
        fence: claimed!.fence,
      }),
    ).toEqual({ active: true })
    const complete = { jobId: first.jobId, fence: claimed!.fence, file: replacement }
    expect(yield* worker.mutation(api.workspace.completeRevision, complete)).toEqual({
      versionId: replacement.currentVersionId,
    })
    expect(yield* worker.mutation(api.workspace.completeRevision, complete)).toEqual({
      versionId: replacement.currentVersionId,
    })
    yield* worker.mutation(api.workspace.upsertBatch, {
      companies: [],
      projects: [],
      files: [file],
      importedAt: 5,
    })
    const details = yield* read.query(api.workspace.fileDetails, { fileId: file.id })
    expect(details.file.currentVersionId).toBe(replacement.currentVersionId)
    expect(details.versions).toHaveLength(2)
    expect(details.jobs[0]?.status).toBe("completed")
    expect(
      yield* read
        .mutation(api.workspace.requestRevision, { ...request, requestId: "request-revision-2" })
        .pipe(Effect.flip),
    ).toMatchObject({ code: "StaleRevision" })
  }).pipe(Effect.provide(layer)),
)
it.effect("cancellation fences a running attempt and leaves the current version untouched", () =>
  Effect.gen(function* () {
    const { read, worker } = yield* setup
    const { jobId } = yield* read.mutation(api.workspace.requestRevision, request)
    const claimed = yield* worker.mutation(api.workspace.claimRevision, { workerId: "worker:one" })
    expect(yield* read.mutation(api.workspace.cancelRevision, { jobId })).toEqual({
      cancelled: true,
    })
    expect(
      yield* worker
        .mutation(api.workspace.completeRevision, {
          jobId,
          fence: claimed!.fence,
          file: replacement,
        })
        .pipe(Effect.flip),
    ).toMatchObject({ code: "LeaseLost" })
    const details = yield* read.query(api.workspace.fileDetails, { fileId: file.id })
    expect(details.file.currentVersionId).toBe(file.currentVersionId)
    expect(details.versions).toHaveLength(1)
    expect(details.jobs[0]?.status).toBe("cancelled")
    expect(
      yield* worker.query(api.workspace.revisionActive, { jobId, fence: claimed!.fence }),
    ).toEqual({ active: false })
  }).pipe(Effect.provide(layer)),
)
it.effect("an expired attempt cannot complete, and a new claim increments the fence", () =>
  Effect.gen(function* () {
    const { test, read, worker } = yield* setup
    const { jobId } = yield* read.mutation(api.workspace.requestRevision, request)
    const first = yield* worker.mutation(api.workspace.claimRevision, { workerId: "worker:one" })
    yield* test.run(
      Effect.gen(function* () {
        const db = yield* Reader,
          writer = yield* Writer
        const job = yield* db
          .table("jobs")
          .index("by_key", (q) => q.eq("workspaceId", "ha-workspace").eq("id", jobId))
          .first()
        if (Option.isNone(job)) return yield* Effect.die("Missing test job")
        yield* writer.table("jobs").patch(job.value._id, { leaseExpiresAt: 0 })
      }),
    )
    expect(
      yield* worker
        .mutation(api.workspace.completeRevision, { jobId, fence: first!.fence, file: replacement })
        .pipe(Effect.flip),
    ).toMatchObject({ code: "LeaseLost" })
    const second = yield* worker.mutation(api.workspace.claimRevision, { workerId: "worker:two" })
    expect(second?.fence).toBe(2)
    expect(
      yield* worker
        .mutation(api.workspace.failRevision, {
          jobId,
          fence: first!.fence,
          message: "Old worker failed",
        })
        .pipe(Effect.flip),
    ).toMatchObject({ code: "LeaseLost" })
    yield* worker.mutation(api.workspace.completeRevision, {
      jobId,
      fence: second!.fence,
      file: replacement,
    })
    expect(
      (yield* read.query(api.workspace.fileDetails, { fileId: file.id })).jobs[0]?.status,
    ).toBe("completed")
  }).pipe(Effect.provide(layer)),
)
it.effect("two queued edits cannot both replace the same base version", () =>
  Effect.gen(function* () {
    const { read, worker } = yield* setup
    yield* read.mutation(api.workspace.requestRevision, request)
    yield* read.mutation(api.workspace.requestRevision, {
      ...request,
      requestId: "request-revision-2",
    })
    const first = yield* worker.mutation(api.workspace.claimRevision, { workerId: "worker:one" })
    const second = yield* worker.mutation(api.workspace.claimRevision, { workerId: "worker:two" })
    yield* worker.mutation(api.workspace.completeRevision, {
      jobId: first!.id,
      fence: first!.fence,
      file: replacement,
    })
    const denied = yield* worker
      .mutation(api.workspace.completeRevision, {
        jobId: second!.id,
        fence: second!.fence,
        file: { ...replacement, currentVersionId: "e".repeat(64), sha256: "f".repeat(64) },
      })
      .pipe(Effect.flip)
    expect(denied).toMatchObject({ code: "StaleRevision" })
    expect(
      (yield* read.query(api.workspace.fileDetails, { fileId: file.id })).versions,
    ).toHaveLength(2)
  }).pipe(Effect.provide(layer)),
)
