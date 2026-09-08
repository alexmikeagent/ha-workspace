import { it } from "@effect/vitest"
import { describe, expect } from "vite-plus/test"
import { Effect, Layer } from "effect"
import { ClaimedRevision, ImportFile, WorkspaceError } from "@ha/domain/workspace"
import { DriveError } from "@ha/documents/drive-store"
import { QueueUnavailable, RevisionQueue, runRevisionAttempt } from "./revisions"

const job: ClaimedRevision = {
  id: "test-job",
  fileId: "test-file",
  baseVersionId: "a".repeat(64),
  status: "running",
  createdAt: 0,
  updatedAt: 0,
  message: "",
  resultVersionId: null,
  find: "before",
  replacement: "after",
  fence: 1,
  leaseExpiresAt: Date.now() + 300_000,
}
const file: ImportFile = {
  id: "test-file",
  name: "Example.txt",
  companyId: null,
  projectId: null,
  category: "reference",
  extension: "txt",
  size: 5,
  modifiedAt: 1,
  importedAt: 1,
  currentVersionId: "b".repeat(64),
  sha256: "c".repeat(64),
  sourceLabel: "Fixture",
}
const fakeQueue = (overrides: Partial<RevisionQueue["Service"]> = {}) =>
  Layer.succeed(
    RevisionQueue,
    RevisionQueue.of({
      claim: () => Effect.succeed(null),
      active: () => Effect.succeed(true),
      complete: () => Effect.void,
      fail: () => Effect.void,
      ...overrides,
    }),
  )

describe("revision attempt acknowledgement", () => {
  it.live("does not start work or report failure after durable cancellation", () =>
    Effect.gen(function* () {
      let started = false,
        failed = false
      yield* runRevisionAttempt(
        job,
        Effect.sync(() => {
          started = true
          return file
        }),
      ).pipe(
        Effect.provide(
          fakeQueue({
            active: () => Effect.succeed(false),
            fail: () =>
              Effect.sync(() => {
                failed = true
              }),
          }),
        ),
      )
      expect(started).toBe(false)
      expect(failed).toBe(false)
    }),
  )
  it.live("interrupts in-flight work and releases its scope when cancellation arrives", () =>
    Effect.gen(function* () {
      let checks = 0,
        cleaned = false,
        failed = false,
        completed = false
      const work = Effect.acquireRelease(Effect.void, () =>
        Effect.sync(() => {
          cleaned = true
        }),
      ).pipe(Effect.andThen(Effect.never))
      yield* runRevisionAttempt(job, work).pipe(
        Effect.provide(
          fakeQueue({
            active: () => Effect.sync(() => ++checks === 1),
            complete: () =>
              Effect.sync(() => {
                completed = true
              }),
            fail: () =>
              Effect.sync(() => {
                failed = true
              }),
          }),
        ),
      )
      expect(checks).toBe(2)
      expect(cleaned).toBe(true)
      expect(failed).toBe(false)
      expect(completed).toBe(false)
    }),
  )
  it.live("does not let an old worker mark a fenced attempt failed", () =>
    Effect.gen(function* () {
      let failed = false
      yield* runRevisionAttempt(
        job,
        Effect.fail(
          new WorkspaceError({ code: "LeaseLost", message: "A newer worker owns this job." }),
        ),
      ).pipe(
        Effect.provide(
          fakeQueue({
            fail: () =>
              Effect.sync(() => {
                failed = true
              }),
          }),
        ),
      )
      expect(failed).toBe(false)
    }),
  )
  it.live("retries the same idempotent completion after an uncertain response", () =>
    Effect.gen(function* () {
      let calls = 0,
        failures = 0
      yield* runRevisionAttempt(job, Effect.succeed(file)).pipe(
        Effect.provide(
          fakeQueue({
            complete: (_job, revision) =>
              Effect.suspend(() => {
                expect(revision.currentVersionId).toBe(file.currentVersionId)
                calls++
                return calls === 1 ? Effect.fail(new QueueUnavailable()) : Effect.void
              }),
            fail: () =>
              Effect.sync(() => {
                failures++
              }),
          }),
        ),
      )
      expect(calls).toBe(2)
      expect(failures).toBe(0)
    }),
  )
  it.live("persists a safe validation error while the attempt still owns its lease", () =>
    Effect.gen(function* () {
      let message = ""
      yield* runRevisionAttempt(
        job,
        Effect.fail(
          new DriveError({ code: "RevisionFailed", message: "The selected passage occurs twice." }),
        ),
      ).pipe(
        Effect.provide(
          fakeQueue({
            fail: (_job, value) =>
              Effect.sync(() => {
                message = value
              }),
          }),
        ),
      )
      expect(message).toBe("The selected passage occurs twice.")
    }),
  )
})
