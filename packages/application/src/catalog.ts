import { CatalogFilter, isOperationalSyncPath, type WorkspaceFile } from "@ha/domain/catalog"
import { Context, Effect, Schema } from "effect"

export class CatalogUnavailable extends Schema.TaggedError<CatalogUnavailable>()(
  "CatalogUnavailable",
  { message: Schema.String },
) {}

export class DriveCatalog extends Context.Service<
  DriveCatalog,
  {
    readonly list: () => Effect.Effect<ReadonlyArray<WorkspaceFile>, CatalogUnavailable>
  }
>()("ha/catalog/DriveCatalog") {}

export const listWorkspaceFiles = Effect.fn("catalog.listWorkspaceFiles")(function* (
  input: unknown,
) {
  const filter = yield* Schema.decodeUnknownEffect(CatalogFilter)(input)
  const catalog = yield* DriveCatalog
  const files = yield* catalog.list()
  const search = filter.search?.trim().toLowerCase() ?? ""

  return files
    .filter(
      (file) =>
        !isOperationalSyncPath(file.name) &&
        (filter.category === undefined || file.category === filter.category) &&
        (filter.companyId === undefined || file.companyId === filter.companyId) &&
        file.name.toLowerCase().includes(search),
    )
    .map(({ id, name, companyId, category, extension, sizeBytes, modifiedAt }) => ({
      id,
      name,
      companyId,
      category,
      extension,
      sizeBytes,
      modifiedAt,
    }))
})
