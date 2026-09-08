import { FunctionImpl } from "@confect/server"
import { Effect, Layer, Option } from "effect"
import type { ReviewJob } from "../src/contracts"
import schema from "./_generated/schema"
import group from "./workspace.spec"
import { databaseContract, failure, identity, publicFile, Reader, Writer } from "./support"

export const publicJob = (job: ReviewJob): ReviewJob => ({
  id: job.id,
  fileId: job.fileId,
  baseVersionId: job.baseVersionId,
  status: job.status,
  createdAt: job.createdAt,
  updatedAt: job.updatedAt,
  message: job.message,
  resultVersionId: job.resultVersionId,
})
const jobById = (workspaceId: string, id: string) =>
  Effect.gen(function* () {
    const db = yield* Reader
    const record = yield* db
      .table("jobs")
      .index("by_key", (q) => q.eq("workspaceId", workspaceId).eq("id", id))
      .first()
      .pipe(databaseContract)
    if (Option.isNone(record))
      return yield* Effect.fail(failure("NotFound", "This revision request was not found."))
    return record.value
  })
const activeLease = (
  job: { status: string; fence: number; leaseExpiresAt: number },
  fence: number,
) => job.status === "running" && job.fence === fence && job.leaseExpiresAt > Date.now()
const requestRevision = FunctionImpl.make(schema, group, "requestRevision", (args) =>
  Effect.gen(function* () {
    const owner = yield* identity("owner")
    if (
      !args.find ||
      args.find.length > 4000 ||
      args.replacement.length > 4000 ||
      args.find === args.replacement ||
      !/^[\w-]{8,120}$/.test(args.requestId)
    )
      return yield* Effect.fail(
        failure(
          "InvalidInput",
          "Provide an exact passage and a different replacement, each at most 4,000 characters.",
        ),
      )
    const db = yield* Reader
    const writer = yield* Writer
    const prior = yield* db
      .table("jobs")
      .index("by_request", (q) =>
        q
          .eq("workspaceId", owner.workspaceId)
          .eq("ownerId", owner.subject)
          .eq("requestId", args.requestId),
      )
      .first()
      .pipe(databaseContract)
    if (Option.isSome(prior)) {
      const job = prior.value
      if (
        job.fileId !== args.fileId ||
        job.baseVersionId !== args.baseVersionId ||
        job.find !== args.find ||
        job.replacement !== args.replacement
      )
        return yield* Effect.fail(
          failure(
            "IdempotencyConflict",
            "This request identifier was already used for a different revision.",
          ),
        )
      return { jobId: job.id }
    }
    const file = yield* db
      .table("files")
      .index("by_key", (q) => q.eq("workspaceId", owner.workspaceId).eq("id", args.fileId))
      .first()
      .pipe(databaseContract)
    if (Option.isNone(file))
      return yield* Effect.fail(failure("NotFound", "This file was not found."))
    if (!["docx", "txt", "md"].includes(file.value.extension))
      return yield* Effect.fail(
        failure(
          "Unsupported",
          "Exact text revisions currently support DOCX, text and Markdown files.",
        ),
      )
    if (file.value.currentVersionId !== args.baseVersionId)
      return yield* Effect.fail(
        failure("StaleRevision", "Open the latest version before requesting a change."),
      )
    const now = Date.now()
    const id = `${owner.subject}:${args.requestId}`
    yield* writer
      .table("jobs")
      .insert({
        ...args,
        id,
        workspaceId: owner.workspaceId,
        ownerId: owner.subject,
        status: "queued",
        createdAt: now,
        updatedAt: now,
        message: "Waiting for the local worker.",
        resultVersionId: null,
        fence: 0,
        leaseExpiresAt: 0,
        workerId: null,
      })
      .pipe(databaseContract)
    return { jobId: id }
  }),
)
const claimRevision = FunctionImpl.make(schema, group, "claimRevision", ({ workerId }) =>
  Effect.gen(function* () {
    const { workspaceId } = yield* identity("importer")
    if (!/^[\w:-]{1,120}$/.test(workerId))
      return yield* Effect.fail(failure("InvalidInput", "Worker identifier is invalid."))
    const db = yield* Reader
    const writer = yield* Writer
    const now = Date.now()
    const running = yield* db
      .table("jobs")
      .index("by_status", (q) => q.eq("workspaceId", workspaceId).eq("status", "running"))
      .collect()
      .pipe(databaseContract)
    const owned = running.find((job) => job.workerId === workerId && job.leaseExpiresAt > now)
    if (owned)
      return {
        ...publicJob(owned),
        find: owned.find,
        replacement: owned.replacement,
        fence: owned.fence,
        leaseExpiresAt: owned.leaseExpiresAt,
      }
    const queued = yield* db
      .table("jobs")
      .index("by_status", (q) => q.eq("workspaceId", workspaceId).eq("status", "queued"))
      .first()
      .pipe(databaseContract)
    const job = Option.isSome(queued)
      ? queued.value
      : running.find((job) => job.leaseExpiresAt <= now)
    if (!job) return null
    const next = {
      status: "running" as const,
      fence: job.fence + 1,
      workerId,
      leaseExpiresAt: now + 5 * 60_000,
      updatedAt: now,
      message: "Preparing a new version.",
    }
    yield* writer.table("jobs").patch(job._id, next).pipe(databaseContract)
    return {
      ...publicJob({ ...job, ...next }),
      find: job.find,
      replacement: job.replacement,
      fence: next.fence,
      leaseExpiresAt: next.leaseExpiresAt,
    }
  }),
)
const completeRevision = FunctionImpl.make(schema, group, "completeRevision", (args) =>
  Effect.gen(function* () {
    const { workspaceId } = yield* identity("importer")
    const job = yield* jobById(workspaceId, args.jobId)
    const db = yield* Reader
    const writer = yield* Writer
    const version = yield* db
      .table("versions")
      .index("by_key", (q) => q.eq("workspaceId", workspaceId).eq("id", args.file.currentVersionId))
      .first()
      .pipe(databaseContract)
    if (
      job.status === "completed" &&
      job.fence === args.fence &&
      job.resultVersionId === args.file.currentVersionId &&
      Option.isSome(version) &&
      version.value.sha256 === args.file.sha256 &&
      version.value.size === args.file.size &&
      version.value.fileId === args.file.id
    )
      return { versionId: args.file.currentVersionId }
    if (!activeLease(job, args.fence))
      return yield* Effect.fail(
        failure(
          "LeaseLost",
          "This attempt expired, was cancelled, or was replaced by another worker.",
        ),
      )
    const current = yield* db
      .table("files")
      .index("by_key", (q) => q.eq("workspaceId", workspaceId).eq("id", job.fileId))
      .first()
      .pipe(databaseContract)
    if (Option.isNone(current))
      return yield* Effect.fail(failure("NotFound", "The file was not found."))
    if (current.value.currentVersionId !== job.baseVersionId)
      return yield* Effect.fail(
        failure("StaleRevision", "The file changed while this revision was being prepared."),
      )
    if (
      args.file.id !== job.fileId ||
      args.file.name !== current.value.name ||
      args.file.companyId !== current.value.companyId ||
      args.file.projectId !== current.value.projectId ||
      args.file.category !== current.value.category ||
      args.file.sourceLabel !== current.value.sourceLabel ||
      args.file.extension !== current.value.extension ||
      args.file.currentVersionId === job.baseVersionId ||
      !/^[a-f0-9]{64}$/.test(args.file.currentVersionId) ||
      !/^[a-f0-9]{64}$/.test(args.file.sha256) ||
      !Number.isSafeInteger(args.file.size) ||
      args.file.size < 0 ||
      !Number.isFinite(args.file.modifiedAt) ||
      !Number.isFinite(args.file.importedAt)
    )
      return yield* Effect.fail(
        failure(
          "InvalidInput",
          "The new revision must retain the source file's identity and document type.",
        ),
      )
    if (Option.isSome(version))
      return yield* Effect.fail(
        failure("VersionConflict", "The new revision identifier is already in use."),
      )
    const prior = yield* db
      .table("versions")
      .index("by_file", (q) => q.eq("workspaceId", workspaceId).eq("fileId", job.fileId))
      .collect()
      .pipe(databaseContract)
    const now = Date.now()
    yield* writer
      .table("versions")
      .insert({
        id: args.file.currentVersionId,
        fileId: job.fileId,
        workspaceId,
        number: prior.length + 1,
        createdAt: now,
        modifiedAt: args.file.modifiedAt,
        sha256: args.file.sha256,
        size: args.file.size,
      })
      .pipe(databaseContract)
    yield* writer
      .table("files")
      .patch(current.value._id, { ...publicFile(args.file), workspaceId })
      .pipe(databaseContract)
    yield* writer
      .table("jobs")
      .patch(job._id, {
        status: "completed",
        resultVersionId: args.file.currentVersionId,
        updatedAt: now,
        message: "A new version is ready.",
        leaseExpiresAt: 0,
      })
      .pipe(databaseContract)
    return { versionId: args.file.currentVersionId }
  }),
)
const failRevision = FunctionImpl.make(schema, group, "failRevision", (args) =>
  Effect.gen(function* () {
    const { workspaceId } = yield* identity("importer")
    const job = yield* jobById(workspaceId, args.jobId)
    if (!activeLease(job, args.fence))
      return yield* Effect.fail(
        failure("LeaseLost", "This attempt no longer owns the revision request."),
      )
    const writer = yield* Writer
    yield* writer
      .table("jobs")
      .patch(job._id, {
        status: "failed",
        updatedAt: Date.now(),
        message: args.message.slice(0, 500),
        leaseExpiresAt: 0,
      })
      .pipe(databaseContract)
    return { failed: true }
  }),
)
const cancelRevision = FunctionImpl.make(schema, group, "cancelRevision", ({ jobId }) =>
  Effect.gen(function* () {
    const owner = yield* identity("owner")
    const job = yield* jobById(owner.workspaceId, jobId)
    if (job.ownerId !== owner.subject)
      return yield* Effect.fail(failure("Forbidden", "Only the author can cancel this request."))
    if (job.status === "completed" || job.status === "failed") return { cancelled: false }
    if (job.status === "cancelled") return { cancelled: true }
    const writer = yield* Writer
    yield* writer
      .table("jobs")
      .patch(job._id, {
        status: "cancelled",
        updatedAt: Date.now(),
        message: "Cancelled. The original version is unchanged.",
        leaseExpiresAt: 0,
      })
      .pipe(databaseContract)
    return { cancelled: true }
  }),
)
const revisionActive = FunctionImpl.make(schema, group, "revisionActive", (args) =>
  Effect.gen(function* () {
    const { workspaceId } = yield* identity("importer")
    const job = yield* jobById(workspaceId, args.jobId)
    return { active: activeLease(job, args.fence) }
  }),
)
export const revisionLayers = Layer.mergeAll(
  requestRevision,
  claimRevision,
  completeRevision,
  failRevision,
  cancelRevision,
  revisionActive,
)
