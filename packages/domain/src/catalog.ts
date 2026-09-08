import { Schema } from "effect"

export const WorkspaceCategory = Schema.Literals([
  "reports",
  "invoices",
  "contracts",
  "templates",
  "reference",
])
export type WorkspaceCategory = typeof WorkspaceCategory.Type

export const Company = Schema.Struct({
  id: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
})
export type Company = typeof Company.Type

// Browser metadata contains opaque identifiers, never filesystem locations.
export const WorkspaceFile = Schema.Struct({
  id: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  companyId: Schema.NullOr(Schema.NonEmptyString),
  category: WorkspaceCategory,
  extension: Schema.String,
  sizeBytes: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
  modifiedAt: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)),
})
export type WorkspaceFile = typeof WorkspaceFile.Type

export const CatalogFilter = Schema.Struct({
  category: Schema.optionalKey(WorkspaceCategory),
  companyId: Schema.optionalKey(Schema.NonEmptyString),
  search: Schema.optionalKey(Schema.String),
})
export type CatalogFilter = typeof CatalogFilter.Type

// Classify every component so files inside temporary sync directories stay out too.
// Configuration files such as .ffs_gui and .ffs_batch are not operational debris.
export const isOperationalSyncPath = (relativePath: string): boolean =>
  relativePath.split(/[\\/]+/).some((component) => /\.ffs_(?:lock|db|tmp)$/i.test(component))
