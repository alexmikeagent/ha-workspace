import { Schema } from "effect"

export const WorkspaceFile = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  companyId: Schema.NullOr(Schema.String),
  projectId: Schema.NullOr(Schema.String),
  category: Schema.String,
  extension: Schema.String,
  size: Schema.Number,
  modifiedAt: Schema.Number,
  importedAt: Schema.Number,
  currentVersionId: Schema.String,
  sourceLabel: Schema.String,
})
export type WorkspaceFile = typeof WorkspaceFile.Type
export const ImportFile = Schema.Struct({ ...WorkspaceFile.fields, sha256: Schema.String })
export type ImportFile = typeof ImportFile.Type
export const Company = Schema.Struct({ id: Schema.String, name: Schema.String })
export type Company = typeof Company.Type
export const Project = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  companyId: Schema.String,
})
export type Project = typeof Project.Type
export const FileVersion = Schema.Struct({
  id: Schema.String,
  number: Schema.Number,
  createdAt: Schema.Number,
  modifiedAt: Schema.Number,
  sha256: Schema.String,
  size: Schema.Number,
})
export type FileVersion = typeof FileVersion.Type
export const FileComment = Schema.Struct({
  id: Schema.String,
  versionId: Schema.String,
  body: Schema.String,
  createdAt: Schema.Number,
  author: Schema.String,
})
export type FileComment = typeof FileComment.Type
export const Catalog = Schema.Struct({
  companies: Schema.Array(
    Schema.Struct({ ...Company.fields, fileCount: Schema.Number, projectCount: Schema.Number }),
  ),
  projects: Schema.Array(Schema.Struct({ ...Project.fields, fileCount: Schema.Number })),
  files: Schema.Array(WorkspaceFile),
  fileCount: Schema.Number,
  matchedFileCount: Schema.Number,
  truncated: Schema.Boolean,
  importedAt: Schema.NullOr(Schema.Number),
})
export type Catalog = typeof Catalog.Type
export const ReviewJob = Schema.Struct({
  id: Schema.String,
  fileId: Schema.String,
  baseVersionId: Schema.String,
  status: Schema.Literals(["queued", "running", "completed", "failed", "cancelled"]),
  createdAt: Schema.Number,
  updatedAt: Schema.Number,
  message: Schema.String,
  resultVersionId: Schema.NullOr(Schema.String),
})
export type ReviewJob = typeof ReviewJob.Type
export const ClaimedRevision = Schema.Struct({
  ...ReviewJob.fields,
  find: Schema.String,
  replacement: Schema.String,
  fence: Schema.Number,
  leaseExpiresAt: Schema.Number,
})
export type ClaimedRevision = typeof ClaimedRevision.Type
export const FileDetails = Schema.Struct({
  file: WorkspaceFile,
  versions: Schema.Array(FileVersion),
  comments: Schema.Array(FileComment),
  jobs: Schema.Array(ReviewJob),
})
export type FileDetails = typeof FileDetails.Type
export class WorkspaceError extends Schema.TaggedError<WorkspaceError>()("WorkspaceError", {
  code: Schema.String,
  message: Schema.String,
}) {}
