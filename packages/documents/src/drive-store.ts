import { createHash } from "node:crypto"
import { lstat } from "node:fs/promises"
import { Config, Context, Effect, FileSystem, Layer, Path, Schema, Stream } from "effect"
import { isCatalogPath, inferCategory, inferGrouping } from "@ha/domain/import-policy"
import { Company, ImportFile, Project } from "@ha/domain/workspace"
import { isOperationalSyncPath } from "@ha/domain/catalog"
import { checkStorageRoots } from "./storage-config"

export class DriveError extends Schema.TaggedError<DriveError>()("DriveError", {
  code: Schema.String,
  message: Schema.String,
}) {}
export const StoredFile = Schema.Struct({
  file: ImportFile,
  relativePath: Schema.String,
})
export const DriveIndex = Schema.Struct({
  importedAt: Schema.Number,
  companies: Schema.Array(Company),
  projects: Schema.Array(Project),
  files: Schema.Array(StoredFile),
  versions: Schema.Record(Schema.String, StoredFile),
})
export type DriveIndex = typeof DriveIndex.Type
export type StoredFile = typeof StoredFile.Type

const idFor = (value: string) => createHash("sha256").update(value).digest("hex")
export const hashFile = Effect.fn("drive.hashFile")(function* (filename: string) {
  const fs = yield* FileSystem.FileSystem
  const hash = yield* Effect.sync(() => createHash("sha256"))
  yield* fs.stream(filename).pipe(
    Stream.runForEach((chunk) =>
      Effect.sync(() => {
        hash.update(chunk)
      }),
    ),
  )
  return hash.digest("hex")
})
const statLink = (filename: string) =>
  Effect.tryPromise({
    try: () => lstat(filename),
    catch: () => new DriveError({ code: "Unavailable", message: "A local file is unavailable." }),
  })

export const resolveDrivePath = Effect.fn("drive.resolvePath")(function* (
  root: string,
  relative: string,
) {
  const path = yield* Path.Path
  const fs = yield* FileSystem.FileSystem
  const parts = relative.split(/[\\/]/)
  if (
    path.isAbsolute(relative) ||
    /^[A-Za-z]:/.test(relative) ||
    relative.includes("\0") ||
    parts.some((part) => !part || part === "." || part === "..")
  ) {
    return yield* new DriveError({
      code: "InvalidPath",
      message: "This file location is not allowed.",
    })
  }
  let current = root
  for (const part of parts) {
    current = path.join(current, part)
    if ((yield* statLink(current)).isSymbolicLink()) {
      return yield* new DriveError({
        code: "InvalidPath",
        message: "Symbolic links are not followed.",
      })
    }
  }
  const resolved = yield* fs.realPath(current)
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    return yield* new DriveError({
      code: "InvalidPath",
      message: "This file is outside the working copy.",
    })
  }
  return resolved
})

export class DriveStore extends Context.Service<
  DriveStore,
  {
    readonly scan: () => Effect.Effect<DriveIndex, DriveError>
    readonly index: () => Effect.Effect<DriveIndex, DriveError>
    readonly recordRevision: (record: StoredFile) => Effect.Effect<void, DriveError>
    readonly resolve: (
      fileId: string,
      versionId: string,
    ) => Effect.Effect<{ path: string; record: StoredFile }, DriveError>
    readonly dataRoot: string
    readonly driveRoot: string
  }
>()("ha/drive/DriveStore") {}

export const DriveStoreLive = Layer.effect(
  DriveStore,
  Effect.gen(function* () {
    yield* checkStorageRoots()
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const driveRoot = yield* fs.realPath(yield* Config.nonEmptyString("FAKE_DRIVE_ROOT"))
    const dataRoot = yield* fs.realPath(yield* Config.nonEmptyString("WORKSPACE_DATA_ROOT"))
    const rawRoots = yield* Config.string("DRIVE_COMPANY_ROOTS")
    const roots = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(Schema.Array(Schema.String)),
    )(rawRoots)
    const indexDir = path.join(dataRoot, "catalog")
    yield* fs.makeDirectory(indexDir, { recursive: true, mode: 0o700 })
    const indexPath = path.join(indexDir, "index.json")
    const revisionDirectory = path.join(indexDir, "versions")
    yield* fs.makeDirectory(revisionDirectory, { recursive: true, mode: 0o700 })
    const mapError = () =>
      new DriveError({
        code: "Unavailable",
        message: "The local catalog could not be read. Run the import command and try again.",
      })
    const index = () =>
      fs
        .readFileString(indexPath)
        .pipe(
          Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(DriveIndex))),
          Effect.mapError(mapError),
        )
    const scan = Effect.fn("drive.scan")(function* () {
      const importedAt = Date.now()
      const previous = (yield* fs.exists(indexPath)) ? yield* index() : null
      const versions: Record<string, StoredFile> = { ...previous?.versions }
      const companies = new Map<string, typeof Company.Type>()
      const projects = new Map<string, typeof Project.Type>()
      const relativeFiles: string[] = []
      const walk = (relative: string): Effect.Effect<void, unknown> =>
        Effect.gen(function* () {
          const directory = path.join(driveRoot, relative)
          for (const name of yield* fs.readDirectory(directory)) {
            if (
              name.startsWith(".") ||
              name.startsWith("~$") ||
              ["tools", "node_modules", "90 - QA Artifacts"].includes(name)
            )
              continue
            const rel = relative ? `${relative}/${name}` : name
            if (isOperationalSyncPath(rel)) continue
            const info = yield* statLink(path.join(driveRoot, rel))
            if (info.isSymbolicLink()) continue
            if (info.isDirectory()) yield* walk(rel)
            else if (info.isFile() && isCatalogPath(rel)) relativeFiles.push(rel)
          }
        })
      yield* walk("")
      const files = yield* Effect.forEach(
        relativeFiles.sort(),
        (relativePath) =>
          Effect.gen(function* () {
            const full = yield* resolveDrivePath(driveRoot, relativePath)
            const before = yield* statLink(full)
            const sha256 = yield* hashFile(full)
            const after = yield* statLink(full)
            if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
              return yield* new DriveError({
                code: "SourceChanged",
                message: "A copied file changed during import. Retry after the copy finishes.",
              })
            }
            const grouping = inferGrouping(relativePath, roots)
            const companyId = grouping.company ? idFor(`company:${grouping.company}`) : null
            const projectId =
              companyId && grouping.project
                ? idFor(`project:${companyId}:${grouping.project}`)
                : null
            if (companyId && grouping.company)
              companies.set(companyId, { id: companyId, name: grouping.company })
            if (projectId && companyId && grouping.project)
              projects.set(projectId, { id: projectId, name: grouping.project, companyId })
            const id = idFor(`file:${relativePath}`)
            const file = {
              id,
              name: path.basename(relativePath),
              companyId,
              projectId,
              category: inferCategory(relativePath),
              extension: path.extname(relativePath).slice(1).toLowerCase(),
              size: before.size,
              modifiedAt: before.mtimeMs,
              importedAt,
              currentVersionId: idFor(`version:${id}:${sha256}`),
              sha256,
              sourceLabel: path.dirname(relativePath),
            }
            const record = { file, relativePath }
            versions[file.currentVersionId] = record
            return record
          }),
        { concurrency: 4 },
      )
      const next = {
        importedAt,
        companies: [...companies.values()],
        projects: [...projects.values()],
        files,
        versions,
      }
      const temporary = `${indexPath}.${importedAt}.tmp`
      yield* fs.writeFileString(temporary, JSON.stringify(next), { mode: 0o600 })
      yield* fs.rename(temporary, indexPath)
      return next
    })
    return DriveStore.of({
      driveRoot,
      dataRoot,
      index,
      recordRevision: (record) =>
        Effect.gen(function* () {
          const versionId = record.file.currentVersionId
          if (
            !/^[a-f0-9]{64}$/.test(versionId) ||
            !record.relativePath.startsWith(".ha-workspace/revisions/")
          ) {
            return yield* new DriveError({
              code: "InvalidRevision",
              message: "The revision is outside managed storage.",
            })
          }
          const full = yield* resolveDrivePath(driveRoot, record.relativePath)
          if ((yield* hashFile(full)) !== record.file.sha256)
            return yield* new DriveError({
              code: "SourceChanged",
              message: "The revision bytes did not match their fingerprint.",
            })
          const journal = path.join(revisionDirectory, `${versionId}.json`)
          if (yield* fs.exists(journal)) {
            const existing = yield* fs
              .readFileString(journal)
              .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(StoredFile))))
            if (
              existing.file.id !== record.file.id ||
              existing.file.sha256 !== record.file.sha256 ||
              existing.file.size !== record.file.size
            ) {
              return yield* new DriveError({
                code: "VersionConflict",
                message: "A different immutable revision already uses this identifier.",
              })
            }
            return
          }
          yield* fs.writeFileString(journal, JSON.stringify(record), { flag: "wx", mode: 0o600 })
        }).pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path),
          Effect.mapError((cause) => (cause instanceof DriveError ? cause : mapError())),
        ),
      scan: () =>
        scan().pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path),
          Effect.mapError((cause) =>
            cause instanceof DriveError
              ? cause
              : new DriveError({
                  code: "ImportFailed",
                  message: "The working copy could not be indexed.",
                }),
          ),
        ),
      resolve: (fileId, versionId) =>
        Effect.gen(function* () {
          const snapshot = yield* index()
          let record = snapshot.versions[versionId]
          if (!record && /^[a-f0-9]{64}$/.test(versionId)) {
            const journal = path.join(revisionDirectory, `${versionId}.json`)
            if (yield* fs.exists(journal))
              record = yield* fs
                .readFileString(journal)
                .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(StoredFile))))
          }
          if (!record || record.file.id !== fileId)
            return yield* new DriveError({
              code: "NotFound",
              message: "This file version was not found.",
            })
          const full = yield* resolveDrivePath(driveRoot, record.relativePath)
          if ((yield* hashFile(full)) !== record.file.sha256)
            return yield* new DriveError({
              code: "SourceChanged",
              message: "The copied file has changed. Reimport it before opening this version.",
            })
          return { path: full, record }
        }).pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path),
          Effect.mapError((cause) => (cause instanceof DriveError ? cause : mapError())),
        ),
    })
  }),
)
