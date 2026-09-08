import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { AtomRegistry } from "effect/unstable/reactivity"
import { desktopSidebarOpenAtom, desktopSidebarWidthAtom, inspectorWidthAtom } from "./state"
import { sidebarWidthLimit } from "./resizable-workspace-shell"
import { clampPanelWidth, panelKeyboardWidth } from "./use-panel-resize"

const registries: AtomRegistry.AtomRegistry[] = []
const widthKey = "ha-workspace.ui.sidebar-width.v1"
const openKey = "ha-workspace.ui.sidebar-open.v1"
const inspectorKey = "ha-workspace.ui.inspector-width.v1"

function preferences(width = "296") {
  const entries = new Map([
    [widthKey, width],
    [openKey, "true"],
    [inspectorKey, "448"],
  ])
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
    removeItem: (key: string) => entries.delete(key),
    clear: () => entries.clear(),
    key: (index: number) => [...entries.keys()][index] ?? null,
    get length() {
      return entries.size
    },
  })
  return entries
}

function mountPreferences() {
  const registry = AtomRegistry.make()
  registries.push(registry)
  registry.mount(desktopSidebarWidthAtom)
  registry.mount(desktopSidebarOpenAtom)
  registry.mount(inspectorWidthAtom)
  return registry
}

afterEach(() => {
  for (const registry of registries.splice(0)) registry.dispose()
  vi.unstubAllGlobals()
})

describe("desktop sidebar width", () => {
  it("persists a resize independently of collapse state and the right inspector", async () => {
    const entries = preferences()
    const first = mountPreferences()
    await vi.waitFor(() => expect(first.get(desktopSidebarWidthAtom)).toBe(296))
    first.set(desktopSidebarWidthAtom, 328)
    first.set(desktopSidebarOpenAtom, false)
    await vi.waitFor(() => {
      expect(entries.get(widthKey)).toBe("328")
      expect(entries.get(openKey)).toBe("false")
    })
    first.dispose()
    const reopened = mountPreferences()
    await vi.waitFor(() => {
      expect(reopened.get(desktopSidebarWidthAtom)).toBe(328)
      expect(reopened.get(desktopSidebarOpenAtom)).toBe(false)
      expect(reopened.get(inspectorWidthAtom)).toBe(448)
    })
    reopened.set(desktopSidebarOpenAtom, true)
    expect(reopened.get(desktopSidebarWidthAtom)).toBe(328)
    expect(entries.get(inspectorKey)).toBe("448")
  })

  it("falls back from an invalid stored width, then accepts a valid resize", async () => {
    const entries = preferences("9000")
    const registry = mountPreferences()
    expect(registry.get(desktopSidebarWidthAtom)).toBe(248)
    registry.set(desktopSidebarWidthAtom, 264)
    await vi.waitFor(() => expect(entries.get(widthKey)).toBe("264"))
  })

  it("reserves workspace space without replacing the stored wider preference", async () => {
    const entries = preferences("360")
    const registry = mountPreferences()
    await vi.waitFor(() => expect(registry.get(desktopSidebarWidthAtom)).toBe(360))
    const narrow = clampPanelWidth(
      registry.get(desktopSidebarWidthAtom),
      220,
      sidebarWidthLimit(620),
      248,
    )
    expect(narrow).toBe(260)
    expect(620 - narrow).toBe(360)
    expect(entries.get(widthKey)).toBe("360")
    expect(
      clampPanelWidth(registry.get(desktopSidebarWidthAtom), 220, sidebarWidthLimit(1200), 248),
    ).toBe(360)
  })

  it("moves the sidebar edge in the opposite direction to the right inspector", () => {
    expect(panelKeyboardWidth("ArrowRight", 248, 220, 360, "left")).toBe(264)
    expect(panelKeyboardWidth("ArrowLeft", 248, 220, 360, "left", true)).toBe(220)
    expect(panelKeyboardWidth("ArrowRight", 350, 220, 360, "left", true)).toBe(360)
    expect(panelKeyboardWidth("Home", 300, 220, 360, "left")).toBe(220)
    expect(panelKeyboardWidth("End", 300, 220, 340, "left")).toBe(340)
    expect(panelKeyboardWidth("Tab", 300, 220, 360, "left")).toBeUndefined()
    expect(panelKeyboardWidth("ArrowRight", 330, 280, 560, "right")).toBe(314)
  })
})
