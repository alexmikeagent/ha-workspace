import { TestConfect } from "@confect/test"
import { Effect } from "effect"
import { it } from "@effect/vitest"
import { expect } from "vite-plus/test"
import schema from "../confect/_generated/schema"
import convexSchema from "../confect/_generated/convexSchema"
import { api } from "./api"
import type { ImportFile } from "./contracts"

const Test = TestConfect.TestConfect<typeof schema>()
const layer = TestConfect.layer(schema, convexSchema, import.meta.glob("../convex/**/*.ts"))
const importer = {
  subject: "service:drive-importer",
  workspaceId: "ha-workspace",
  role: "importer",
}
const owner = {
  subject: "local:akh",
  workspaceId: "ha-workspace",
  role: "owner",
  name: "Workspace owner",
}
const file: ImportFile = {
  id: "file-one",
  name: "Example.docx",
  companyId: "company-one",
  projectId: "project-one",
  category: "report",
  extension: "docx",
  size: 40,
  modifiedAt: 100,
  importedAt: 200,
  currentVersionId: "a".repeat(64),
  sha256: "b".repeat(64),
  sourceLabel: "Example project",
}
const batch = {
  companies: [{ id: "company-one", name: "Example Company" }],
  projects: [{ id: "project-one", companyId: "company-one", name: "Example Project" }],
  files: [file],
  importedAt: 200,
}
const run = <A, E>(effect: Effect.Effect<A, E, TestConfect.TestConfect<typeof schema>>) =>
  effect.pipe(Effect.provide(layer))

it.effect("rejects unauthenticated, foreign-workspace and owner import calls", () =>
  run(
    Effect.gen(function* () {
      const test = yield* Test
      const unauth = yield* test.query(api.workspace.catalog, {}).pipe(Effect.flip)
      expect(unauth).toMatchObject({ code: "Unauthenticated" })
      const foreign = yield* test
        .withIdentity({ ...owner, workspaceId: "another" })
        .query(api.workspace.catalog, {})
        .pipe(Effect.flip)
      expect(foreign).toMatchObject({ code: "Forbidden" })
      const denied = yield* test
        .withIdentity(owner)
        .mutation(api.workspace.upsertBatch, batch)
        .pipe(Effect.flip)
      expect(denied).toMatchObject({ code: "Forbidden" })
    }),
  ),
)
it.effect("reimports idempotently and preserves immutable versions with anchored comments", () =>
  run(
    Effect.gen(function* () {
      const test = yield* Test
      const write = test.withIdentity(importer)
      const read = test.withIdentity(owner)
      expect(yield* write.mutation(api.workspace.upsertBatch, batch)).toEqual({
        inserted: 1,
        updated: 0,
        unchanged: 0,
      })
      expect(yield* write.mutation(api.workspace.upsertBatch, batch)).toEqual({
        inserted: 0,
        updated: 0,
        unchanged: 1,
      })
      const args = {
        fileId: file.id,
        versionId: file.currentVersionId,
        body: "Please check this wording.",
        idempotencyKey: "request-comment-one",
      }
      const first = yield* read.mutation(api.workspace.addComment, args)
      expect(yield* read.mutation(api.workspace.addComment, args)).toEqual(first)
      const conflict = yield* read
        .mutation(api.workspace.addComment, { ...args, body: "A different comment" })
        .pipe(Effect.flip)
      expect(conflict).toMatchObject({ code: "IdempotencyConflict" })
      const next = {
        ...file,
        currentVersionId: "c".repeat(64),
        sha256: "d".repeat(64),
        size: 42,
        importedAt: 300,
        modifiedAt: 250,
      }
      yield* write.mutation(api.workspace.upsertBatch, { ...batch, files: [next], importedAt: 300 })
      const details = yield* read.query(api.workspace.fileDetails, { fileId: file.id })
      expect(details.versions).toHaveLength(2)
      expect(details.comments).toHaveLength(1)
      expect(details.comments[0]?.versionId).toBe(file.currentVersionId)
      expect(details.file.currentVersionId).toBe(next.currentVersionId)
      const collision = yield* write
        .mutation(api.workspace.upsertBatch, {
          ...batch,
          files: [{ ...file, sha256: "e".repeat(64) }],
        })
        .pipe(Effect.flip)
      expect(collision).toMatchObject({ code: "VersionConflict" })
      const catalog = yield* read.query(api.workspace.catalog, { search: "example" })
      expect(catalog.fileCount).toBe(1)
      expect(Object.keys(catalog.files[0] ?? {})).not.toContain("workspaceId")
      expect(catalog.companies[0]?.fileCount).toBe(1)
    }),
  ),
)
it.effect("validates references and rolls back the complete failed transaction", () =>
  run(
    Effect.gen(function* () {
      const test = yield* Test
      const invalid = yield* test
        .withIdentity(importer)
        .mutation(api.workspace.upsertBatch, {
          ...batch,
          files: [{ ...file, companyId: "wrong-company" }],
        })
        .pipe(Effect.flip)
      expect(invalid).toMatchObject({ code: "InvalidReference" })
      const catalog = yield* test.withIdentity(owner).query(api.workspace.catalog, {})
      expect(catalog.companies).toHaveLength(0)
      expect(catalog.fileCount).toBe(0)
    }),
  ),
)
