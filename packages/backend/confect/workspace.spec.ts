import { FunctionSpec, GroupSpec } from "@confect/core"
import { Schema } from "effect"
import {
  Catalog,
  ClaimedRevision,
  Company,
  FileDetails,
  ImportFile,
  Project,
  WorkspaceError,
} from "../src/contracts"

const error = () => WorkspaceError
export const catalog = FunctionSpec.publicQuery({
  name: "catalog",
  args: () => ({
    search: Schema.optionalKey(Schema.String),
    companyId: Schema.optionalKey(Schema.String),
    projectId: Schema.optionalKey(Schema.String),
    category: Schema.optionalKey(Schema.String),
  }),
  returns: () => Catalog,
  error,
})
export const fileDetails = FunctionSpec.publicQuery({
  name: "fileDetails",
  args: () => ({ fileId: Schema.String }),
  returns: () => FileDetails,
  error,
})
export const addComment = FunctionSpec.publicMutation({
  name: "addComment",
  args: () => ({
    fileId: Schema.String,
    versionId: Schema.String,
    body: Schema.String,
    idempotencyKey: Schema.String,
  }),
  returns: () => Schema.Struct({ commentId: Schema.String }),
  error,
})
export const upsertBatch = FunctionSpec.publicMutation({
  name: "upsertBatch",
  args: () => ({
    companies: Schema.Array(Company),
    projects: Schema.Array(Project),
    files: Schema.Array(ImportFile),
    importedAt: Schema.Number,
  }),
  returns: () =>
    Schema.Struct({ inserted: Schema.Number, updated: Schema.Number, unchanged: Schema.Number }),
  error,
})
export const requestRevision = FunctionSpec.publicMutation({
  name: "requestRevision",
  args: () => ({
    fileId: Schema.String,
    baseVersionId: Schema.String,
    find: Schema.String,
    replacement: Schema.String,
    requestId: Schema.String,
  }),
  returns: () => Schema.Struct({ jobId: Schema.String }),
  error,
})
export const claimRevision = FunctionSpec.publicMutation({
  name: "claimRevision",
  args: () => ({ workerId: Schema.String }),
  returns: () => Schema.NullOr(ClaimedRevision),
  error,
})
export const completeRevision = FunctionSpec.publicMutation({
  name: "completeRevision",
  args: () => ({ jobId: Schema.String, fence: Schema.Number, file: ImportFile }),
  returns: () => Schema.Struct({ versionId: Schema.String }),
  error,
})
export const failRevision = FunctionSpec.publicMutation({
  name: "failRevision",
  args: () => ({ jobId: Schema.String, fence: Schema.Number, message: Schema.String }),
  returns: () => Schema.Struct({ failed: Schema.Boolean }),
  error,
})
export const cancelRevision = FunctionSpec.publicMutation({
  name: "cancelRevision",
  args: () => ({ jobId: Schema.String }),
  returns: () => Schema.Struct({ cancelled: Schema.Boolean }),
  error,
})
export const revisionActive = FunctionSpec.publicQuery({
  name: "revisionActive",
  args: () => ({ jobId: Schema.String, fence: Schema.Number }),
  returns: () => Schema.Struct({ active: Schema.Boolean }),
  error,
})
export default GroupSpec.make()
  .addFunction(catalog)
  .addFunction(fileDetails)
  .addFunction(addComment)
  .addFunction(upsertBatch)
  .addFunction(requestRevision)
  .addFunction(claimRevision)
  .addFunction(completeRevision)
  .addFunction(failRevision)
  .addFunction(cancelRevision)
  .addFunction(revisionActive)
