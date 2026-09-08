import { CatalogUnavailable, DriveCatalog, listWorkspaceFiles } from "@ha/application/catalog"
import { Effect, Layer } from "effect"
import { Atom } from "effect/unstable/reactivity"
import type { WorkspaceSection } from "./state"

// The setup milestone has no storage adapter or backend session yet. Keep that
// absence explicit instead of presenting invented company/file data as an import.
const unconnectedCatalog = Layer.succeed(DriveCatalog, {
  list: () =>
    Effect.fail(
      new CatalogUnavailable({ message: "The local catalog has not been connected yet." }),
    ),
})

export const workspaceRuntime = Atom.runtime(unconnectedCatalog)
export const workspaceFiles = Atom.family((section: WorkspaceSection) =>
  workspaceRuntime.atom(listWorkspaceFiles(section === "companies" ? {} : { category: section })),
)
