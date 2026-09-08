import { Atom } from "effect/unstable/reactivity"
import { Schema } from "effect"
import { KeyValueStore } from "effect/unstable/persistence"

export type WorkspaceSection = "companies" | "reports" | "invoices" | "templates"
export type InspectorTab = "review" | "context" | "agent"

// Each RegistryProvider owns these values. Nothing is shared between SSR requests.
export const sidebarOpenAtom = Atom.make(false)
const preferenceRuntime = Atom.runtime(KeyValueStore.layerStorage(() => localStorage))
export const desktopSidebarOpenAtom = Atom.kvs({
  runtime: preferenceRuntime,
  key: "ha-workspace.ui.sidebar-open.v1",
  schema: Schema.Boolean,
  defaultValue: () => true,
})
export const SIDEBAR_MIN_WIDTH = 220
export const SIDEBAR_MAX_WIDTH = 360
export const SIDEBAR_DEFAULT_WIDTH = 248
export const desktopSidebarWidthAtom = Atom.kvs({
  runtime: preferenceRuntime,
  key: "ha-workspace.ui.sidebar-width.v1",
  schema: Schema.Finite.check(
    Schema.isBetween({ minimum: SIDEBAR_MIN_WIDTH, maximum: SIDEBAR_MAX_WIDTH }),
  ),
  defaultValue: () => SIDEBAR_DEFAULT_WIDTH,
})
export const INSPECTOR_MIN_WIDTH = 280
export const INSPECTOR_MAX_WIDTH = 560
export const INSPECTOR_DEFAULT_WIDTH = 330
export const inspectorWidthAtom = Atom.kvs({
  runtime: preferenceRuntime,
  key: "ha-workspace.ui.inspector-width.v1",
  schema: Schema.Finite.check(
    Schema.isBetween({ minimum: INSPECTOR_MIN_WIDTH, maximum: INSPECTOR_MAX_WIDTH }),
  ),
  defaultValue: () => INSPECTOR_DEFAULT_WIDTH,
})
export const inspectorOpenAtom = Atom.writable(
  () => typeof window !== "undefined" && window.innerWidth > 1100,
  (get, open: boolean) => get.setSelf(open),
)
export const inspectorTabAtom = Atom.make<InspectorTab>("context")

export const sortAtom = Atom.make<"recent" | "name">("recent")
export const filePageAtom = Atom.family((_key: string) => Atom.make(1))

export interface WorkspaceSearch {
  section: WorkspaceSection
  company?: string
  project?: string
  file?: string
  version?: string
  q?: string
}

const shortString = (value: unknown) =>
  typeof value === "string" && value.length > 0 ? value.slice(0, 300) : undefined

export function validateWorkspaceSearch(search: Record<string, unknown>): WorkspaceSearch {
  return {
    section:
      search.section === "reports" ||
      search.section === "invoices" ||
      search.section === "templates"
        ? search.section
        : "companies",
    company: shortString(search.company),
    project: shortString(search.project),
    file: shortString(search.file),
    version: shortString(search.version),
    q: shortString(search.q),
  }
}

export const formatDate = (timestamp: number) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(
    timestamp,
  )

export const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
