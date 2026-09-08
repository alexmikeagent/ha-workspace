import { FunctionImpl, GroupImpl } from "@confect/server"
import { Effect, Layer, Option } from "effect"
import { databaseContract, failure, identity, publicFile, Reader, Writer } from "./support"
import { revisionLayers, publicJob } from "./revisions"
import schema from "./_generated/schema"
import group from "./workspace.spec"

const catalog = FunctionImpl.make(schema, group, "catalog", (args) =>
  Effect.gen(function* () {
    const { workspaceId } = yield* identity("owner")
    const db = yield* Reader
    const files = yield* db
      .table("files")
      .index("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect()
      .pipe(databaseContract)
    const companies = yield* db
      .table("companies")
      .index("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect()
      .pipe(databaseContract)
    const projects = yield* db
      .table("projects")
      .index("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect()
      .pipe(databaseContract)
    const search = args.search?.trim().toLowerCase() ?? ""
    const filtered = files
      .filter(
        (file) =>
          (!args.companyId || file.companyId === args.companyId) &&
          (!args.projectId || file.projectId === args.projectId) &&
          (!args.category || file.category === args.category) &&
          (!search || `${file.name} ${file.sourceLabel}`.toLowerCase().includes(search)),
      )
      .sort((a, b) => b.modifiedAt - a.modifiedAt || a.id.localeCompare(b.id))
    return {
      companies: companies
        .map((company) => ({
          id: company.id,
          name: company.name,
          fileCount: files.filter((file) => file.companyId === company.id).length,
          projectCount: projects.filter((project) => project.companyId === company.id).length,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      projects: projects
        .map((project) => ({
          id: project.id,
          name: project.name,
          companyId: project.companyId,
          fileCount: files.filter((file) => file.projectId === project.id).length,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      files: filtered.slice(0, 500).map(publicFile),
      fileCount: files.length,
      matchedFileCount: filtered.length,
      truncated: filtered.length > 500,
      importedAt: files.length ? Math.max(...files.map((file) => file.importedAt)) : null,
    }
  }),
)
const fileDetails = FunctionImpl.make(schema, group, "fileDetails", ({ fileId }) =>
  Effect.gen(function* () {
    const { workspaceId } = yield* identity("owner")
    const db = yield* Reader
    const record = yield* db
      .table("files")
      .index("by_key", (q) => q.eq("workspaceId", workspaceId).eq("id", fileId))
      .first()
      .pipe(databaseContract)
    if (Option.isNone(record))
      return yield* Effect.fail(failure("NotFound", "This file is not in the workspace."))
    const versions = yield* db
      .table("versions")
      .index("by_file", (q) => q.eq("workspaceId", workspaceId).eq("fileId", fileId))
      .collect()
      .pipe(databaseContract)
    const comments = yield* db
      .table("comments")
      .index("by_file", (q) => q.eq("workspaceId", workspaceId).eq("fileId", fileId))
      .collect()
      .pipe(databaseContract)
    const jobs = yield* db
      .table("jobs")
      .index("by_file", (q) => q.eq("workspaceId", workspaceId).eq("fileId", fileId))
      .collect()
      .pipe(databaseContract)
    return {
      jobs: jobs.map(publicJob).sort((a, b) => b.createdAt - a.createdAt),
      file: publicFile(record.value),
      versions: versions
        .map((v) => ({
          id: v.id,
          number: v.number,
          createdAt: v.createdAt,
          modifiedAt: v.modifiedAt,
          sha256: v.sha256,
          size: v.size,
        }))
        .sort((a, b) => b.number - a.number),
      comments: comments
        .map((c) => ({
          id: c.id,
          versionId: c.versionId,
          body: c.body,
          createdAt: c.createdAt,
          author: c.author,
        }))
        .sort((a, b) => a.createdAt - b.createdAt),
    }
  }),
)
const addComment = FunctionImpl.make(schema, group, "addComment", (args) =>
  Effect.gen(function* () {
    const user = yield* identity("owner")
    const db = yield* Reader
    const writer = yield* Writer
    const body = args.body.trim()
    if (!body || body.length > 4000 || !/^[\w-]{8,120}$/.test(args.idempotencyKey))
      return yield* Effect.fail(
        failure(
          "InvalidInput",
          "Write a comment of 1–4,000 characters and use a valid request identifier.",
        ),
      )
    const existing = yield* db
      .table("comments")
      .index("by_request", (q) =>
        q
          .eq("workspaceId", user.workspaceId)
          .eq("authorId", user.subject)
          .eq("idempotencyKey", args.idempotencyKey),
      )
      .first()
      .pipe(databaseContract)
    if (Option.isSome(existing)) {
      if (
        existing.value.fileId !== args.fileId ||
        existing.value.versionId !== args.versionId ||
        existing.value.body !== body
      )
        return yield* Effect.fail(
          failure("IdempotencyConflict", "This request was already used for a different comment."),
        )
      return { commentId: existing.value.id }
    }
    const version = yield* db
      .table("versions")
      .index("by_key", (q) => q.eq("workspaceId", user.workspaceId).eq("id", args.versionId))
      .first()
      .pipe(databaseContract)
    if (Option.isNone(version) || version.value.fileId !== args.fileId)
      return yield* Effect.fail(
        failure("NotFound", "Select an existing version before commenting."),
      )
    const id = `${user.subject}:${args.idempotencyKey}`
    yield* writer
      .table("comments")
      .insert({
        id,
        fileId: args.fileId,
        versionId: args.versionId,
        body,
        createdAt: Date.now(),
        author: user.name,
        authorId: user.subject,
        workspaceId: user.workspaceId,
        idempotencyKey: args.idempotencyKey,
      })
      .pipe(databaseContract)
    return { commentId: id }
  }),
)
const upsertBatch = FunctionImpl.make(schema, group, "upsertBatch", (args) =>
  Effect.gen(function* () {
    const { workspaceId } = yield* identity("importer")
    if (args.files.length > 100 || args.companies.length > 100 || args.projects.length > 100)
      return yield* Effect.fail(
        failure("InvalidInput", "Import at most 100 records of each kind per transaction."),
      )
    const db = yield* Reader
    const writer = yield* Writer
    for (const company of args.companies) {
      const old = yield* db
        .table("companies")
        .index("by_key", (q) => q.eq("workspaceId", workspaceId).eq("id", company.id))
        .first()
        .pipe(databaseContract)
      if (Option.isSome(old)) {
        if (old.value.name !== company.name)
          yield* writer
            .table("companies")
            .patch(old.value._id, { name: company.name })
            .pipe(databaseContract)
      } else
        yield* writer
          .table("companies")
          .insert({ ...company, workspaceId })
          .pipe(databaseContract)
    }
    for (const project of args.projects) {
      const company = yield* db
        .table("companies")
        .index("by_key", (q) => q.eq("workspaceId", workspaceId).eq("id", project.companyId))
        .first()
        .pipe(databaseContract)
      if (Option.isNone(company))
        return yield* Effect.fail(failure("InvalidReference", "Import a project's company first."))
      const old = yield* db
        .table("projects")
        .index("by_key", (q) => q.eq("workspaceId", workspaceId).eq("id", project.id))
        .first()
        .pipe(databaseContract)
      if (Option.isSome(old)) {
        if (old.value.name !== project.name || old.value.companyId !== project.companyId)
          yield* writer.table("projects").patch(old.value._id, project).pipe(databaseContract)
      } else
        yield* writer
          .table("projects")
          .insert({ ...project, workspaceId })
          .pipe(databaseContract)
    }
    let inserted = 0,
      updated = 0,
      unchanged = 0
    for (const file of args.files) {
      if (
        !/^[a-f0-9]{64}$/.test(file.sha256) ||
        !/^[a-f0-9]{64}$/.test(file.currentVersionId) ||
        !Number.isFinite(file.size) ||
        file.size < 0 ||
        file.name.includes("/") ||
        file.name.includes("\\") ||
        file.sourceLabel.startsWith("/")
      )
        return yield* Effect.fail(failure("InvalidInput", "File metadata failed validation."))
      const projectId = file.projectId
      const companyId = file.companyId
      if (projectId) {
        const project = yield* db
          .table("projects")
          .index("by_key", (q) => q.eq("workspaceId", workspaceId).eq("id", projectId))
          .first()
          .pipe(databaseContract)
        if (Option.isNone(project) || project.value.companyId !== file.companyId)
          return yield* Effect.fail(
            failure("InvalidReference", "This file's project and company do not match."),
          )
      } else if (companyId) {
        const company = yield* db
          .table("companies")
          .index("by_key", (q) => q.eq("workspaceId", workspaceId).eq("id", companyId))
          .first()
          .pipe(databaseContract)
        if (Option.isNone(company))
          return yield* Effect.fail(failure("InvalidReference", "Import a file's company first."))
      }
      const old = yield* db
        .table("files")
        .index("by_key", (q) => q.eq("workspaceId", workspaceId).eq("id", file.id))
        .first()
        .pipe(databaseContract)
      const version = yield* db
        .table("versions")
        .index("by_key", (q) => q.eq("workspaceId", workspaceId).eq("id", file.currentVersionId))
        .first()
        .pipe(databaseContract)
      if (
        Option.isSome(version) &&
        (version.value.fileId !== file.id ||
          version.value.sha256 !== file.sha256 ||
          version.value.size !== file.size)
      )
        return yield* Effect.fail(
          failure("VersionConflict", "An immutable version already exists with different content."),
        )
      if (Option.isNone(version)) {
        const prior = yield* db
          .table("versions")
          .index("by_file", (q) => q.eq("workspaceId", workspaceId).eq("fileId", file.id))
          .collect()
          .pipe(databaseContract)
        yield* writer
          .table("versions")
          .insert({
            id: file.currentVersionId,
            fileId: file.id,
            workspaceId,
            number: prior.length + 1,
            createdAt: args.importedAt,
            modifiedAt: file.modifiedAt,
            sha256: file.sha256,
            size: file.size,
          })
          .pipe(databaseContract)
      }
      // Rescanning a known source version cannot undo an app revision or advance backwards.
      if (
        Option.isSome(old) &&
        Option.isSome(version) &&
        old.value.currentVersionId !== file.currentVersionId
      ) {
        unchanged++
        continue
      }
      const fields = { ...publicFile(file), workspaceId }
      if (Option.isNone(old)) {
        yield* writer.table("files").insert(fields).pipe(databaseContract)
        inserted++
      } else if (
        old.value.currentVersionId === file.currentVersionId &&
        old.value.name === file.name &&
        old.value.companyId === file.companyId &&
        old.value.projectId === file.projectId &&
        old.value.category === file.category &&
        old.value.sourceLabel === file.sourceLabel &&
        old.value.modifiedAt === file.modifiedAt
      )
        unchanged++
      else {
        yield* writer.table("files").patch(old.value._id, fields).pipe(databaseContract)
        updated++
      }
    }
    return { inserted, updated, unchanged }
  }),
)
export default GroupImpl.make(schema, group).pipe(
  Layer.provide(Layer.mergeAll(catalog, fileDetails, addComment, upsertBatch, revisionLayers)),
  GroupImpl.finalize,
)
