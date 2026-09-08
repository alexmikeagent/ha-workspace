/// <reference types="vite/client" />
import * as BunFileSystem from "@effect/platform-bun/BunFileSystem"
import * as BunChildProcessSpawner from "@effect/platform-bun/BunChildProcessSpawner"
import { TestConfect } from "@confect/test"
import { it } from "@effect/vitest"
import { api } from "@ha/backend/api"
import { WorkspaceError } from "@ha/domain/workspace"
import { DriveStore, DriveStoreLive, hashFile } from "@ha/documents/drive-store"
import { PreviewStore, PreviewStoreLive } from "@ha/documents/preview"
import { childEnvironment } from "@ha/documents/process-environment"
import { ConfigProvider, Effect, FileSystem, Layer, Path } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { describe, expect } from "vite-plus/test"
import schema from "../../../packages/backend/confect/_generated/schema"
import convexSchema from "../../../packages/backend/confect/_generated/convexSchema"
import { prepareRevision, QueueUnavailable, RevisionQueue, runRevisionAttempt } from "./revisions"

const filesystem = Layer.mergeAll(BunFileSystem.layer, Path.layer)
const platform = BunChildProcessSpawner.layer.pipe(Layer.provideMerge(filesystem))
const Test = TestConfect.TestConfect<typeof schema>()
const testLayer = TestConfect.layer(
  schema,
  convexSchema,
  import.meta.glob("../../../packages/backend/convex/**/*.ts"),
)
const convertError = (error: unknown) =>
  error instanceof WorkspaceError ? error : new QueueUnavailable()
const fixtureProgram = `from pathlib import Path
import sys,zipfile
p=Path(sys.argv[1])
parts={
'[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
'_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
'word/document.xml':'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" mc:Ignorable="w14"><w:body><w:p><w:r><w:t>Original wording for this synthetic fixture.</w:t></w:r></w:p><w:sectPr/></w:body></w:document>'}
with zipfile.ZipFile(p,'x') as z:
 for name,text in parts.items():z.writestr(name,text)
print('Fixture created')
`

// CI runs the focused Python tests separately. This adapter test runs when Doppler supplies both runtimes.
describe.skipIf(!process.env.PYTHON_BIN || !process.env.LIBREOFFICE_BIN)(
  "synthetic revision through real document tools",
  () => {
    it.live(
      "keeps original bytes and comments while committing a verified DOCX/PDF revision",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem
          const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
          const dataRoot = yield* fs.makeTempDirectoryScoped({ prefix: "ha-revision-integration-" })
          const driveRoot = `${dataRoot}/fake-drive`
          yield* fs.makeDirectory(driveRoot)
          const source = `${driveRoot}/Synthetic fixture.docx`
          const python = process.env.PYTHON_BIN!
          yield* spawner.string(
            ChildProcess.make(python, ["-c", fixtureProgram, source], {
              env: childEnvironment,
              extendEnv: false,
              stderr: "ignore",
            }),
          )
          const originalHash = yield* hashFile(source)
          const config = ConfigProvider.layer(
            ConfigProvider.fromUnknown({
              APP_ENV: "test",
              WORKSPACE_DATA_ROOT: dataRoot,
              FAKE_DRIVE_ROOT: driveRoot,
              DRIVE_COMPANY_ROOTS: "[]",
              PYTHON_BIN: python,
              LIBREOFFICE_BIN: process.env.LIBREOFFICE_BIN,
            }),
          )
          const services = PreviewStoreLive.pipe(Layer.provideMerge(DriveStoreLive))
          yield* Effect.gen(function* () {
            const test = yield* Test
            const store = yield* DriveStore
            const preview = yield* PreviewStore
            const scan = yield* store.scan()
            const sourceFile = scan.files[0]!.file
            const owner = test.withIdentity({
              subject: "local:fixture",
              workspaceId: "ha-workspace",
              role: "owner",
            })
            const worker = test.withIdentity({
              subject: "service:fixture-worker",
              workspaceId: "ha-workspace",
              role: "importer",
            })
            yield* worker.mutation(api.workspace.upsertBatch, {
              companies: scan.companies,
              projects: scan.projects,
              files: scan.files.map((record) => record.file),
              importedAt: scan.importedAt,
            })
            yield* owner.mutation(api.workspace.addComment, {
              fileId: sourceFile.id,
              versionId: sourceFile.currentVersionId,
              body: "Review this exact source version.",
              idempotencyKey: "fixture-comment-one",
            })
            yield* owner.mutation(api.workspace.requestRevision, {
              fileId: sourceFile.id,
              baseVersionId: sourceFile.currentVersionId,
              find: "Original wording",
              replacement: "Revised wording",
              requestId: "fixture-revision-one",
            })
            const job = yield* worker.mutation(api.workspace.claimRevision, {
              workerId: "fixture:worker",
            })
            if (!job) return yield* Effect.die("Synthetic job was not claimed")
            const queue = RevisionQueue.of({
              claim: (workerId) =>
                worker
                  .mutation(api.workspace.claimRevision, { workerId })
                  .pipe(Effect.mapError(convertError)),
              active: (job) =>
                worker
                  .query(api.workspace.revisionActive, { jobId: job.id, fence: job.fence })
                  .pipe(
                    Effect.map((value) => value.active),
                    Effect.mapError(convertError),
                  ),
              complete: (job, file) =>
                worker
                  .mutation(api.workspace.completeRevision, {
                    jobId: job.id,
                    fence: job.fence,
                    file,
                  })
                  .pipe(Effect.asVoid, Effect.mapError(convertError)),
              fail: (job, message) =>
                worker
                  .mutation(api.workspace.failRevision, {
                    jobId: job.id,
                    fence: job.fence,
                    message,
                  })
                  .pipe(Effect.asVoid, Effect.mapError(convertError)),
            })
            yield* runRevisionAttempt(job, prepareRevision(job)).pipe(
              Effect.provideService(RevisionQueue, queue),
            )
            const details = yield* owner.query(api.workspace.fileDetails, { fileId: sourceFile.id })
            expect(details.jobs[0]?.status).toBe("completed")
            expect(details.versions).toHaveLength(2)
            expect(details.file.currentVersionId).not.toBe(sourceFile.currentVersionId)
            expect(details.comments[0]?.versionId).toBe(sourceFile.currentVersionId)
            expect(yield* hashFile(source)).toBe(originalHash)
            const revised = yield* store.resolve(sourceFile.id, details.file.currentVersionId)
            expect(revised.path).not.toBe(source)
            expect(revised.record.file.sha256).toBe(details.versions[0]?.sha256)
            const rendered = yield* preview.content(sourceFile.id, details.file.currentVersionId)
            expect(rendered.mime).toBe("application/pdf")
            expect(new TextDecoder().decode((yield* fs.readFile(rendered.path)).slice(0, 5))).toBe(
              "%PDF-",
            )
            const content = yield* preview.context(sourceFile.id, details.file.currentVersionId)
            expect(content.text).toContain("Revised wording")
            expect(content.text).not.toContain("Original wording")
            expect(
              (yield* fs.readDirectory(dataRoot)).some((name) => name.startsWith("revision-")),
            ).toBe(false)
            // Recovery reconstructs the same content hash and reuses only byte-identical immutable output.
            const replay = yield* prepareRevision(job).pipe(Effect.scoped)
            expect(replay.currentVersionId).toBe(details.file.currentVersionId)
            yield* queue.complete(job, replay)
            expect(
              (yield* owner.query(api.workspace.fileDetails, { fileId: sourceFile.id })).versions,
            ).toHaveLength(2)
          }).pipe(Effect.provide(services), Effect.provide(config), Effect.provide(testLayer))
        }).pipe(Effect.scoped, Effect.provide(platform)),
      120_000,
    )
  },
)
