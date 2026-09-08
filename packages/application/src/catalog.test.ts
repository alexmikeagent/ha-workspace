import { it } from "@effect/vitest"
import type { WorkspaceFile } from "@ha/domain/catalog"
import { Effect, Layer } from "effect"
import { expect } from "vite-plus/test"

import { CatalogUnavailable, DriveCatalog, listWorkspaceFiles } from "./catalog"

const files: ReadonlyArray<WorkspaceFile> = [
  {
    id: "report-a",
    name: "Field Report.docx",
    companyId: "company-a",
    category: "reports",
    extension: "docx",
    sizeBytes: 100,
    modifiedAt: 1,
  },
  {
    id: "invoice-a",
    name: "Invoice.docx",
    companyId: "company-a",
    category: "invoices",
    extension: "docx",
    sizeBytes: 100,
    modifiedAt: 1,
  },
  {
    id: "report-b",
    name: "Field Report.docx",
    companyId: "company-b",
    category: "reports",
    extension: "docx",
    sizeBytes: 100,
    modifiedAt: 1,
  },
]

const catalogLayer = Layer.succeed(DriveCatalog, {
  list: () => Effect.succeed(files),
})

it.effect("isolates category and company while matching a normalized search", () =>
  Effect.gen(function* () {
    const results = yield* listWorkspaceFiles({
      category: "reports",
      companyId: "company-a",
      search: "  FIELD  ",
    }).pipe(Effect.provide(catalogLayer))

    expect(results.map((file) => file.id)).toEqual(["report-a"])
  }),
)

it.effect("rejects invalid filters before reading the catalog", () =>
  Effect.gen(function* () {
    let reads = 0
    const layer = Layer.succeed(DriveCatalog, {
      list: () =>
        Effect.sync(() => {
          reads++
          return files
        }),
    })
    const error = yield* listWorkspaceFiles({
      category: "not-a-category",
    }).pipe(Effect.provide(layer), Effect.flip)

    expect(error._tag).toBe("SchemaError")
    expect(reads).toBe(0)
  }),
)

it.effect("preserves a typed catalog failure", () =>
  Effect.gen(function* () {
    const unavailable = new CatalogUnavailable({
      message: "Catalog is not connected",
    })
    const layer = Layer.succeed(DriveCatalog, {
      list: () => Effect.fail(unavailable),
    })
    const error = yield* listWorkspaceFiles({}).pipe(Effect.provide(layer), Effect.flip)

    expect(error).toBe(unavailable)
  }),
)

it.effect("projects browser metadata without adapter-only fields", () =>
  Effect.gen(function* () {
    const layer = Layer.succeed(DriveCatalog, {
      list: () =>
        Effect.succeed(
          files.map((file) => ({
            ...file,
            absolutePath: "/private/catalog/source.docx",
          })),
        ),
    })
    const results = yield* listWorkspaceFiles({}).pipe(Effect.provide(layer))

    expect(results).toEqual(files)
    expect(results.every((file) => !("absolutePath" in file))).toBe(true)
  }),
)

it.effect("omits sync metadata from active catalog results without mutating input", () =>
  Effect.gen(function* () {
    const metadata = files.map((file, index) => ({
      ...file,
      id: `sync-${file.id}`,
      name: ["sync.ffs_lock", "SYNC.FFS_DB", "report.docx.ffs_tmp"][index] ?? "sync.ffs_lock",
    }))
    const source = [...files, ...metadata]
    const layer = Layer.succeed(DriveCatalog, {
      list: () => Effect.succeed(source),
    })
    const results = yield* listWorkspaceFiles({}).pipe(Effect.provide(layer))

    expect(results).toEqual(files)
    expect(source).toEqual([...files, ...metadata])
    expect(source).toHaveLength(6)
  }),
)
