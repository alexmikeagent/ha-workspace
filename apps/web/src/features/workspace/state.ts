import { Atom } from "effect/unstable/reactivity"

export type WorkspaceSection = "companies" | "reports" | "invoices" | "templates"
export type InspectorTab = "review" | "context" | "agent"

// Each RegistryProvider owns these values. Nothing is shared between SSR requests.
export const sidebarOpenAtom = Atom.make(false)
export const inspectorOpenAtom = Atom.make(true)
export const inspectorTabAtom = Atom.make<InspectorTab>("context")
